import { readFile } from "node:fs/promises";

import {
  findAgentGalaxyReviewEntityIds,
  normalizeAgentGalaxyResolvedEntity,
  resolveAgentGalaxyReviewEntities,
} from "../src/lib/agentGalaxyEntityResolver.ts";
import {
  resolveAgentGalaxyImmersiveContextFromEntity,
} from "../src/lib/agentGalaxyImmersiveContext.ts";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");
const [
  backgroundText,
  fullPayloadText,
  canvas,
  workspace,
  workspaceCss,
  reviewConfig,
  resolver,
  desktop,
  tauri,
] = await Promise.all([
  read(".visual-review/app17/agent-background.json"),
  read(".visual-review/app17/payload.json"),
  read("src/components/AgentGalaxyFlowCanvas.tsx"),
  read("src/components/AgentGalaxyImmersiveWorkspace.tsx"),
  read("src/components/AgentGalaxyImmersiveWorkspace.css"),
  read("src/lib/agentGalaxyImmersiveReview.ts"),
  read("src/lib/agentGalaxyEntityResolver.ts"),
  read("src/lib/desktop.ts"),
  read("src-tauri/src/lib.rs"),
]);
const background = JSON.parse(backgroundText);
const fullPayload = JSON.parse(fullPayloadText);
const fixtures = findAgentGalaxyReviewEntityIds(background, fullPayload);
assert(fixtures.sampledPaperId, "Missing sampled paper fixture.");
assert(
  fixtures.snapshotUnsampledPaperId,
  "Missing snapshot-unsampled paper fixture.",
);
assert(fixtures.hotspotId, "Missing hotspot fixture.");

const requests = [
  { kind: "paper", entityId: fixtures.sampledPaperId },
  { kind: "paper", entityId: fixtures.snapshotUnsampledPaperId },
  { kind: "hotspot", entityId: fixtures.hotspotId },
  { kind: "paper", entityId: "missing:paper:does-not-exist" },
];
const [sampled, unsampled, hotspot, missing] =
  resolveAgentGalaxyReviewEntities(background, fullPayload, requests);
assert(sampled.membership === "sampled", "Sampled paper changed membership.");
assert(
  unsampled.membership === "snapshot-unsampled",
  "Unsampled paper did not resolve from the source snapshot.",
);
assert(
  unsampled.semanticPosition
  && unsampled.hotspotPosition
  && unsampled.semanticOffset,
  "Unsampled paper is missing restored semantic coordinates.",
);
for (let axis = 0; axis < 3; axis += 1) {
  const restored = unsampled.hotspotPosition[axis]
    + unsampled.semanticOffset[axis];
  assert(
    Math.abs(restored - unsampled.semanticPosition[axis]) <= 1e-9,
    `Unsampled coordinate restoration failed on axis ${axis}.`,
  );
}
assert(
  hotspot.kind === "hotspot" && hotspot.membership === "sampled",
  "Hotspot identity did not resolve.",
);
assert(
  missing.membership === "missing"
  && !missing.semanticPosition
  && !missing.hotspotId,
  "Missing entity produced a fake placement.",
);

const activeOnly = normalizeAgentGalaxyResolvedEntity(background, {
  kind: "paper",
  entityId: "fixture:active-only:unclassified-paper",
  membership: "active-only",
  sourceSnapshotId: background.sourceSnapshotId,
  field: "Unclassified",
});
assert(
  activeOnly.placementRule === "unclassified-frontier-v1"
  && activeOnly.hotspotPosition
  && !activeOnly.hotspotId
  && !activeOnly.semanticPosition,
  "Active-only entity violates the unclassified frontier rule.",
);
const activeOnlyRepeat = normalizeAgentGalaxyResolvedEntity(background, {
  kind: "paper",
  entityId: activeOnly.entityId,
  membership: "active-only",
  sourceSnapshotId: background.sourceSnapshotId,
  field: "Unclassified",
});
assert(
  JSON.stringify(activeOnly.hotspotPosition)
    === JSON.stringify(activeOnlyRepeat.hotspotPosition),
  "Active-only placement is not deterministic.",
);

const context = resolveAgentGalaxyImmersiveContextFromEntity(
  background,
  unsampled,
  { maximumContextPapers: 24 },
);
assert(context, "Snapshot-unsampled paper did not produce context.");
assert(
  context.contextPapers.length <= 24,
  "Context extraction exceeded 24 papers.",
);
assert(
  new Set(context.contextEntityIds).size === context.contextEntityIds.length,
  "Context extraction contains duplicate identities.",
);
const sourceChecks = {
  sixAgentStates: [
    "idle",
    "input",
    "thinking",
    "answer",
    "reading",
    "focus",
  ].every((state) => reviewConfig.includes(`"${state}"`)),
  sameVertexContextRoles:
    canvas.includes('"aContextRoleA"')
    && canvas.includes('"aContextRoleB"')
    && canvas.includes("paperResult.geometry")
    && !canvas.includes("new THREE.Points(context"),
  dynamicCache24:
    canvas.includes("createDynamicPaperGeometry(24)")
    && canvas.includes("dynamic-empty:")
    && canvas.includes("result.paperById.clear()"),
  noRendererRebuildOnIntent:
    canvas.includes("contextPresentationRevisionRef.current += 1")
    && /\}, \[config, payload, reducedMotion\]\);/.test(canvas),
  rigidContextTranslation:
    canvas.includes("slot.translation.copy(contextTranslationScratch)")
    && canvas.includes("flowPosition += uContextATranslation * contextMemberA"),
  orderedEvidenceReveal:
    canvas.includes('"aContextOrderA"')
    && canvas.includes('"aContextOrderB"')
    && canvas.includes("uContextAEvidenceProgress")
    && canvas.includes("uContextBEvidenceProgress")
    && canvas.includes("3.2"),
  contextVisibilityFloor:
    canvas.includes("uContextBackgroundLuma: { value: 0.68 }"),
  restrainedTargetSize:
    canvas.includes("uContextTargetCssPixels: { value: 4.8 }")
    && canvas.includes("Math.min(4.8, slot.profile.targetCssPixels)"),
  lightImmersiveCamera:
    canvas.includes('mode === "soft-focus") return 0.08')
    && canvas.includes('mode === "full-focus") return 0.15'),
  noSemanticTimeOpacity:
    canvas.includes("semanticCoreTimeOpacity: false")
    && !/uContext[A-B][A-Za-z]*Opacity/.test(canvas),
  exactCoordinateBridge:
    workspace.includes("AgentGalaxyTheoryBridgeCanvas")
    && workspaceCss.includes("400ms")
    && workspace.includes("不进行逐星插值"),
  explicitMissingHandling:
    workspace.includes("missing:paper:does-not-exist")
    && resolver.includes('membership: "missing"'),
  readOnlyDesktopResolver:
    desktop.includes('"resolve_agent_galaxy_entities"')
    && tauri.includes("SQLITE_OPEN_READ_ONLY")
    && tauri.includes("fn resolve_agent_galaxy_entities"),
  noDatabaseMigration:
    !resolver.includes("CREATE TABLE")
    && !resolver.includes("ALTER TABLE"),
  pureBlackSharpRendering:
    workspaceCss.includes("background: #000")
    && canvas.includes("setClearColor(0x000000, 1)")
    && !/Bokeh|UnrealBloomPass|motionBlur/.test(canvas),
};
for (const [name, pass] of Object.entries(sourceChecks)) {
  assert(pass, `Immersive stage 1 source check failed: ${name}`);
}

console.log(JSON.stringify({
  pass: true,
  phase: "stage-1-immersive-background-implementation",
  payload: {
    sourceSnapshotId: background.sourceSnapshotId,
    sourcePapers: background.sourcePaperCount,
    residentPapers: background.papers.length,
    hotspots: background.hotspots.length,
  },
  fixtures: {
    sampled: sampled.entityId,
    snapshotUnsampled: unsampled.entityId,
    activeOnly: activeOnly.entityId,
    hotspot: hotspot.entityId,
    missing: missing.entityId,
  },
  context: {
    count: context.contextPapers.length,
    maximum: 24,
    relation: context.relation,
  },
  sourceChecks,
  browserVisualAcceptance: "UNVERIFIED",
  tauriReadOnlyAcceptance: "UNVERIFIED",
  userVisualAcceptance: "UNVERIFIED",
}, null, 2));
