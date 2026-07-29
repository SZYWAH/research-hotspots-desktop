import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path), "utf8");
const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};
const between = (source, start, end) => {
  const startIndex = source.indexOf(start);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert(startIndex >= 0 && endIndex > startIndex, `Cannot isolate ${start}`);
  return source.slice(startIndex, endIndex);
};

const types = read("src/types.ts");
const desktop = read("src/lib/desktop.ts");
const rust = read("src-tauri/src/lib.rs");
const immersive = read("src/components/AgentImmersiveStarfieldCanvas.tsx");
const immersiveRuntime = immersive.slice(
  0,
  immersive.indexOf("export function hasTheoryCoordinates"),
);
const dualPage = read("src/components/AgentDualBackgroundPage.tsx");
const theory = read("src/components/App17GalaxyCanvas.tsx");
const app = read("src/App.tsx");
const reference = readFileSync("D:\\wenjian\\Desktop\\agent背景.html");

const payloadType = between(
  types,
  "export type AgentImmersiveBackgroundPayloadV2",
  "export type V20AnalysisState",
);
for (const forbidden of [
  "position",
  "offset",
  "centroid",
  "isotropicScale",
  "layoutVersion",
  "projectionVersion",
]) {
  assert(
    !payloadType.includes(forbidden),
    `Immersive payload schema contains forbidden coordinate field: ${forbidden}`,
  );
}
assert(payloadType.includes("sourceSnapshotId"), "Immersive payload has no source snapshot identity");
assert(payloadType.includes("sessionSeed"), "Immersive payload has no session seed");

const rustBuilder = between(
  rust,
  "fn build_agent_immersive_background_payload(",
  "#[cfg(feature = \"dev-tools\")]",
);
for (const forbidden of [
  "membership.x",
  "membership.y",
  "membership.z",
  "hotspot.x",
  "hotspot.y",
  "hotspot.z",
  "semantic_offset",
  "source_centroid",
  "isotropic_scale",
]) {
  assert(
    !rustBuilder.includes(forbidden),
    `Immersive SQL/build path reads theory coordinate: ${forbidden}`,
  );
}
assert(
  rust.includes("OpenFlags::SQLITE_OPEN_READ_ONLY"),
  "Immersive payload command is not explicitly read-only",
);
assert(
  rust.includes("AGENT_IMMERSIVE_DEFAULT_PAPER_COUNT: usize = 6_000"),
  "Immersive target is not locked to 6,000 papers",
);
assert(
  rust.includes("AGENT_IMMERSIVE_MIN_PER_HOTSPOT: usize = 12"),
  "Per-hotspot floor is missing",
);
assert(
  rust.includes("allocate_agent_immersive_papers"),
  "Largest-remainder allocation path is missing",
);

assert(
  desktop.includes("\"load_agent_immersive_background\""),
  "Desktop invoke wrapper is missing",
);
assert(
  !immersive.includes("AgentGalaxyBackgroundPayloadV1"),
  "Independent immersive renderer imports the theory-derived V1 payload",
);
for (const forbidden of ["paper.offset", "hotspot.position", "sourceCentroid", "isotropicScale"]) {
  assert(
    !immersiveRuntime.includes(forbidden),
    `Immersive renderer consumes theory coordinate: ${forbidden}`,
  );
}
assert(
  immersive.includes("`${payload.sessionSeed}\\u0000paper\\u0000${paper.id}`"),
  "Paper world assignment is not stable per session seed and entity ID",
);
assert(
  immersive.includes("writeRandomPosition(basePositions, index, random, FIELD_SIZE)"),
  "Paper stars are not assigned to the independent wide random field",
);
assert(
  immersive.includes("writeRandomPosition(basePositions, index, random, HOTSPOT_CORE_RADIUS)"),
  "Hotspots are not assigned to the independent core field",
);
assert(
  immersive.includes("camera.position.set(0, 0, 25)"),
  "Reference camera position was not preserved",
);
assert(
  immersive.includes("new THREE.PerspectiveCamera(60"),
  "Reference 60-degree FOV was not preserved",
);
assert(
  immersive.includes("createGpgpuRuntime")
  && immersive.includes("VELOCITY_FRAGMENT_SHADER")
  && immersive.includes("ANALYTIC_FLOW_GLSL"),
  "Stateful two-level flow or analytic fallback is missing",
);
const coreShader = between(
  immersive,
  "const CORE_FRAGMENT_SHADER",
  "const CORONA_FRAGMENT_SHADER",
);
assert(!coreShader.includes("uTime"), "Semantic star core reads time-driven alpha");
assert(
  immersive.includes("depthWrite: !corona"),
  "Sharp core and optical corona are not separated",
);
assert(
  !immersive.includes("UnrealBloomPass")
  && !immersive.includes("Bokeh")
  && !immersive.includes("motionBlur"),
  "Immersive renderer contains a forbidden blur/postprocess path",
);

assert(
  dualPage.includes("setMountedMode(null)")
  && dualPage.includes("await nextAnimationFrame()"),
  "Background switch does not create an explicit renderer-free frame",
);
assert(
  dualPage.includes("data-renderer-count={mountedMode ? 1 : 0}"),
  "Single-renderer diagnostic is missing",
);
assert(
  dualPage.includes("window.crypto.getRandomValues"),
  "Production session seed is not created with Web Crypto",
);
assert(
  dualPage.includes("window.sessionStorage")
  && dualPage.includes("window.localStorage.setItem(MODE_STORAGE_KEY"),
  "Session continuation or background preference persistence is missing",
);
assert(
  dualPage.includes("本版仅记录提交；科研 Agent 回答后端尚未接入"),
  "The prompt shell does not disclose the absent Agent backend",
);
assert(
  app.includes("<AgentDualBackgroundPage"),
  "Formal Research Agent navigation still renders the old workspace directly",
);
assert(
  app.includes("advancedWorkspace={(") && app.includes("<AgentWorkspace"),
  "The supervised Agent workspace is not preserved as the advanced workbench",
);

assert(
  theory.includes("visualProfile = \"analysis\""),
  "Standalone galaxy default visual profile is no longer analysis",
);
assert(
  theory.includes("interactionMode = \"explore\""),
  "Standalone galaxy default interaction mode changed",
);
assert(
  theory.includes("visualProfile === \"agent-theory\""),
  "Agent-only theory material branch is missing",
);
assert(
  theory.includes("labelsVisibleRef.current"),
  "Ambient/explore label visibility is not isolated",
);

const result = {
  status: "PASS",
  payloadCoordinateFields: 0,
  targetPapers: 6_000,
  hotspotFloor: 12,
  hotspotIdentityTarget: 160,
  immersiveRenderer: "independent-session-random-two-level-flow",
  singleRendererSwitch: true,
  theoryProfileDefault: "analysis",
  agentTheoryProfile: "agent-theory",
  referenceHtmlSha256: createHash("sha256").update(reference).digest("hex").toUpperCase(),
};

console.log(JSON.stringify(result, null, 2));
