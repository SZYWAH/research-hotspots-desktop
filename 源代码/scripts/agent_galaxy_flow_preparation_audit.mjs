import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function collectKeys(value, keys = new Set()) {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
    return keys;
  }
  if (!value || typeof value !== "object") return keys;
  for (const [key, entry] of Object.entries(value)) {
    keys.add(key.toLowerCase());
    collectKeys(entry, keys);
  }
  return keys;
}

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  project,
  roadmap,
  status,
  architecture,
  decisions,
  baselineText,
  fixturesText,
  contract,
  replacement,
  backgroundText,
  manifestText,
  fullPayloadText,
  packageText,
  threeText,
  legacyVisualAudit,
] = await Promise.all([
  read("docs/PROJECT.md"),
  read("docs/ROADMAP.md"),
  read("docs/STATUS.md"),
  read("docs/ARCHITECTURE.md"),
  read("docs/DECISIONS.md"),
  read("docs/evidence/agent-galaxy-flow-baseline-2026-07-27.json"),
  read("docs/evidence/agent-galaxy-focus-fixtures-v1.json"),
  read("src/lib/agentGalaxyFlowContract.ts"),
  read("docs/evidence/agent-galaxy-audit-replacement-v1.md"),
  read(".visual-review/app17/agent-background.json"),
  read(".visual-review/app17/manifest.json"),
  read(".visual-review/app17/payload.json"),
  read("package.json"),
  read("node_modules/three/package.json"),
  read("scripts/agent_galaxy_background_visual_audit.mjs"),
]);

const baseline = JSON.parse(baselineText);
const fixtures = JSON.parse(fixturesText);
const background = JSON.parse(backgroundText);
const fullPayload = JSON.parse(fullPayloadText);
const packageJson = JSON.parse(packageText);
const threePackage = JSON.parse(threeText);

const requiredDocumentChecks = {
  projectAuthority: project.includes("状态：权威事实入口")
    && project.includes("M1“沉浸式视觉方向确认”的开发前准备已经完成"),
  roadmapReopened: roadmap.includes("M1 沉浸式视觉方向确认")
    && roadmap.includes("重新打开"),
  statusCategories: ["## PASS", "## FAIL", "## UNVERIFIED"].every((heading) => status.includes(heading)),
  architectureFlow: architecture.includes("ParticleAssignment")
    && architecture.includes("FlowModel")
    && architecture.includes("DynamicFocusLayer"),
  decisionsLocked: decisions.includes("流动形态暂不固定")
    && decisions.includes("3,840 是常驻预算，不是检索边界"),
  replacementExplicit: replacement.includes("在正式流场实现时替换")
    && replacement.includes("必须删除或禁止"),
};

for (const [name, pass] of Object.entries(requiredDocumentChecks)) {
  assert(pass, `Agent galaxy preparation document check failed: ${name}`);
}

assert(baseline.schemaVersion === 1, "Unexpected baseline schema version.");
assert(baseline.sourceHead === "33d97d45a952d489de4d08e941d14277d2c71f08", "Baseline source HEAD changed.");
assert(baseline.preparationBranch === "codex/agent-galaxy-flow-engine", "Preparation branch identity changed.");
assert(baseline.candidateAssessment.infrastructure === "PASS", "Legacy infrastructure status must remain PASS.");
assert(baseline.candidateAssessment.visualAcceptance === "FAIL", "Legacy visual status must remain FAIL.");
assert(baseline.payload.sha256 === sha256(backgroundText), "Background payload hash differs from frozen baseline.");
assert(baseline.payload.manifestSha256 === sha256(manifestText), "Visual manifest hash differs from frozen baseline.");
assert(baseline.payload.sizeBytes === Buffer.byteLength(backgroundText), "Background payload byte size differs from baseline.");
assert(baseline.payload.sourcePaperCount === background.sourcePaperCount, "Source paper count differs from baseline.");
assert(baseline.payload.sourceHotspotCount === background.sourceHotspotCount, "Source hotspot count differs from baseline.");
assert(baseline.payload.sampledPaperCount === background.papers.length, "Sampled paper count differs from baseline.");
assert(baseline.payload.hotspotCount === background.hotspots.length, "Hotspot count differs from baseline.");
assert(baseline.payload.sourceSnapshotId === background.sourceSnapshotId, "Background snapshot differs from baseline.");
assert(baseline.payload.paperLayoutVersion === background.paperLayoutVersion, "Paper layout differs from baseline.");
assert(baseline.runtime.packageVersion === packageJson.version, "Package version differs from baseline.");
assert(baseline.runtime.threeDeclared === packageJson.dependencies.three, "Declared Three.js range differs from baseline.");
assert(baseline.runtime.threeInstalled === threePackage.version, "Installed Three.js version differs from baseline.");

const sampledPaperIds = new Set(background.papers.map((paper) => paper.id));
const fullPaperIds = new Set(fullPayload.papers.map((paper) => paper.rawPaperId));
const hotspotIds = new Set(fullPayload.hotspots.map((hotspot) => hotspot.id));
const hotspotByTopic = new Map(
  fullPayload.hotspots.map((hotspot) => [`${hotspot.field}\0${hotspot.topicId}`, hotspot.id]),
);
const paperHotspotById = new Map(
  fullPayload.papers.map((paper) => [
    paper.rawPaperId,
    hotspotByTopic.get(`${paper.field}\0${paper.topicId}`),
  ]),
);

assert(fixtures.schemaVersion === 1, "Unexpected focus fixture schema.");
assert(fixtures.sourceSnapshotId === background.sourceSnapshotId, "Fixture snapshot does not match the background.");
assert(fixtures.sampledPapers.length === 2, "Expected exactly two sampled paper fixtures.");
assert(fixtures.snapshotUnsampledPapers.length === 2, "Expected exactly two snapshot-unsampled fixtures.");
for (const paper of fixtures.sampledPapers) {
  assert(sampledPaperIds.has(paper.id), `Sampled fixture is not resident: ${paper.id}`);
  assert(paperHotspotById.get(paper.id) === paper.hotspotId, `Sampled fixture hotspot mismatch: ${paper.id}`);
}
for (const paper of fixtures.snapshotUnsampledPapers) {
  assert(fullPaperIds.has(paper.id), `Snapshot-unsampled fixture is not in the full payload: ${paper.id}`);
  assert(!sampledPaperIds.has(paper.id), `Snapshot-unsampled fixture is unexpectedly resident: ${paper.id}`);
  assert(paperHotspotById.get(paper.id) === paper.hotspotId, `Snapshot-unsampled hotspot mismatch: ${paper.id}`);
}
assert(fixtures.activeOnlyPaper.fixtureOnly === true, "Active-only fixture must be explicitly synthetic.");
assert(!fullPaperIds.has(fixtures.activeOnlyPaper.id), "Synthetic active-only fixture collided with a real paper.");
assert(fixtures.missingPaper.fixtureOnly === true, "Missing fixture must be explicitly synthetic.");
assert(!fullPaperIds.has(fixtures.missingPaper.id), "Missing fixture collided with a real paper.");

const scaleGroups = ["small", "medium", "large"];
for (const scale of scaleGroups) {
  assert(fixtures.hotspotsByScale[scale].length === 2, `Expected two ${scale} hotspot fixtures.`);
  for (const hotspot of fixtures.hotspotsByScale[scale]) {
    assert(hotspotIds.has(hotspot.id), `Hotspot fixture is missing from the full payload: ${hotspot.id}`);
    const source = fullPayload.hotspots.find((entry) => entry.id === hotspot.id);
    assert(source.paperCount === hotspot.paperCount, `Hotspot paper count mismatch: ${hotspot.id}`);
  }
}

const sameHotspotIds = new Set(
  fixtures.multiEntityGroups.sameHotspot.entityIds.map((id) => paperHotspotById.get(id)),
);
assert(!sameHotspotIds.has(undefined) && sameHotspotIds.size === 1, "Same-hotspot fixture does not resolve to one hotspot.");
const crossHotspotIds = new Set(
  fixtures.multiEntityGroups.crossHotspot.entityIds.map((id) => paperHotspotById.get(id)),
);
assert(!crossHotspotIds.has(undefined) && crossHotspotIds.size >= 2, "Cross-hotspot fixture does not span hotspots.");

const forbiddenFixtureKeys = ["title", "summary", "abstract", "evidence", "content", "keywords"];
const fixtureKeys = collectKeys(fixtures);
for (const key of forbiddenFixtureKeys) {
  assert(!fixtureKeys.has(key), `Focus fixtures must not store ${key}.`);
}

const contractChecks = {
  contractVersion: contract.includes('AGENT_GALAXY_FLOW_CONTRACT_VERSION = "agent-galaxy-flow-contract-v1"'),
  twoTechnicalModels: contract.includes('"curve-flow-tech-preview"')
    && contract.includes('"tidal-curl-tech-preview"'),
  focusIntent: contract.includes("export type AgentGalaxyFocusIntent"),
  memberships: ["sampled", "snapshot-unsampled", "active-only", "missing"]
    .every((value) => contract.includes(`\"${value}\"`)),
  flowModel: contract.includes("export interface AgentGalaxyFlowModel")
    && contract.includes("sampleTangent"),
  sixStates: ["idle", "input", "thinking", "answer", "reading", "focus"]
    .every((value) => contract.includes(`\"${value}\"`)),
  budgets: ["160", "3840", "1800", "2600", "800", "1500", "2500", "4000", "16", "32"]
    .every((value) => contract.includes(value)),
  sharpness: contract.includes("semanticCoreFullResolution: true")
    && contract.includes("semanticCoreUsesTimeOpacity: false")
    && contract.includes("semanticStarsUseDepthOfField: false")
    && contract.includes("semanticStarsUseMotionBlur: false"),
};

for (const [name, pass] of Object.entries(contractChecks)) {
  assert(pass, `Agent galaxy flow contract check failed: ${name}`);
}

assert(legacyVisualAudit.includes('productVisualAcceptance: "FAIL"'), "Legacy visual audit must report product FAIL.");
assert(legacyVisualAudit.includes('scope: "legacy-infrastructure-only"'), "Legacy visual audit scope is not explicit.");

console.log(JSON.stringify({
  pass: true,
  phase: "agent-galaxy-flow-preparation",
  baseline: {
    sourceHead: baseline.sourceHead,
    payloadSha256: baseline.payload.sha256,
    sourcePaperCount: background.sourcePaperCount,
    hotspotCount: background.hotspots.length,
    sampledPaperCount: background.papers.length,
  },
  documentChecks: requiredDocumentChecks,
  contractChecks,
  fixtures: {
    sampled: fixtures.sampledPapers.length,
    snapshotUnsampled: fixtures.snapshotUnsampledPapers.length,
    activeOnly: 1,
    missing: 1,
    hotspots: scaleGroups.reduce(
      (count, scale) => count + fixtures.hotspotsByScale[scale].length,
      0,
    ),
    multiEntityGroups: Object.keys(fixtures.multiEntityGroups).length,
  },
  legacyVisualAssessment: "FAIL",
  defaultHomepageChanged: false,
  flowImplemented: false,
}, null, 2));
