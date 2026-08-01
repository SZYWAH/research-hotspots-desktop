import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const sourcePath = path.join(
  process.cwd(),
  "src",
  "components",
  "App17GalaxyCanvas.tsx",
);
const source = fs.readFileSync(sourcePath, "utf8");
const checks = [];
const addCheck = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

const paperLayer = source.match(
  /function createPaperLayer\([\s\S]*?\n}\n\nfunction createHotspotLayer/,
)?.[0] ?? "";
const paperMaterial = source.match(
  /function createPaperMaterial\([\s\S]*?\n}\n\nfunction createHotspotPointSourceMaterial/,
)?.[0] ?? "";
const hotspotLayer = source.match(
  /function createHotspotLayer\([\s\S]*?\n}\n\nfunction createTheoryFarBackgroundLayer/,
)?.[0] ?? "";
const hotspotMaterial = source.match(
  /function createHotspotPointSourceMaterial\([\s\S]*?\n}\n\nfunction createFocusMaterial/,
)?.[0] ?? "";
const agentHotspotFragment = hotspotMaterial.match(
  /fragmentShader: agentTheory \? \(opticalPass \? `([\s\S]*?)`\) : `/,
)?.[1] ?? "";
const sphereLayer = source.match(
  /function createAgentTheoryHotspotSphereLayer\([\s\S]*?\n}\n\nfunction setAgentDepthRangeOnObject/,
)?.[0] ?? "";

for (const [name, passed, detail] of [
  [
    "paper model exposes optional semanticColor",
    /semanticColor\?: string/.test(source),
    "App17ParticlePoint.semanticColor",
  ],
  [
    "theory papers retain the raw hotspot family color",
    /semanticColor: app17FamilyColor\(paper\.field, paper\.topicId\)/.test(source),
    "buildApp15TheoryScene",
  ],
  [
    "paper geometry carries an independent semanticColor attribute",
    /semanticColors/.test(paperLayer)
      && /setAttribute\(\"semanticColor\"/.test(paperLayer),
    "createPaperLayer",
  ],
  [
    "Agent theory paper shader reads semanticColor",
    /varying vec3 vSemanticColor/.test(paperMaterial)
      && /mix\(vec3\(luminance\), vSemanticColor, semanticChroma\)/.test(paperMaterial)
      && /mix\(0\.52, 0\.78, vAgentNearness\)/.test(paperMaterial),
    "createPaperMaterial",
  ],
  [
    "analysis paper color path remains available",
    /fragmentShader: agentTheory \?/.test(paperMaterial)
      && /finalColor = mix\(vColor, vec3\(1\.0\)/.test(paperMaterial),
    "analysis branch",
  ],
  [
    "hotspot core and optical passes share one geometry",
    /new THREE\.Points\(geometry, coreMaterial\)/.test(hotspotLayer)
      && /new THREE\.Points\(geometry, opticalMaterial\)/.test(hotspotLayer),
    "createHotspotLayer",
  ],
  [
    "business picking remains bound to the core entity",
    /pickObject: coreObject/.test(hotspotLayer),
    "hotspot pickObject",
  ],
  [
    "Agent theory hotspot core stays a clear 2.8-5.2px point source",
    /float angularCssDiameter = worldDiameter/.test(hotspotMaterial)
      && /APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX = 2\.8/.test(source)
      && /APP17_AGENT_THEORY_HOTSPOT_CORE_MAX_CSS_PX = 5\.2/.test(source)
      && /APP17_AGENT_THEORY_HOTSPOT_CORE_MIN_CSS_PX\.toFixed/.test(
        hotspotMaterial,
      )
      && /\* \$\{APP15_COORD_SCALE\.toFixed\(4\)\}/.test(hotspotMaterial),
    "compact overview core",
  ],
  [
    "Agent theory optical shoulder is bounded to 5.5-10px",
    /APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX = 5\.5/.test(source)
      && /APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MAX_CSS_PX = 10/.test(source)
      && /APP17_AGENT_THEORY_HOTSPOT_OPTICAL_MIN_CSS_PX\.toFixed/.test(
        hotspotMaterial,
      ),
    "optical PSF LOD",
  ],
  [
    "optical shoulder and rays are capped at 10%",
    /min\(0\.10, shoulderEnergy \+ rayEnergy\)/.test(hotspotMaterial)
      && /focusArc \* 0\.12/.test(hotspotMaterial),
    "optical opacity cap",
  ],
  [
    "Agent hotspot material has no Lambert sphere lighting",
    agentHotspotFragment.length > 0
      && !/sphereZ|vec3 normal|dot\(normal|key\s*=|fill\s*=/.test(agentHotspotFragment),
    "Agent hotspot fragment",
  ],
  [
    "Agent hotspot uses a point-spread function rather than a full disc",
    /subpixelShoulder/.test(agentHotspotFragment)
      && /shoulderPoint/.test(hotspotMaterial)
      && /horizontalSpike/.test(hotspotMaterial)
      && /verticalSpike/.test(hotspotMaterial)
      && !/directionalLight|Lambert/i.test(agentHotspotFragment),
    "hybrid stellar LOD",
  ],
  [
    "Ambient and Explore disable overview sphere eligibility",
    /resolveAgentTheoryStellarLod\(\s*diameter,\s*false,\s*previousLod,\s*\)/.test(
      sphereLayer,
    )
      && /hotspotLayer\.setResolvedSphereBlends\(sphereState\.blendById\)/.test(
        source,
      ),
    "overview PSF ownership",
  ],
  [
    "the local system photosphere crossfades only in the final 400ms",
    /systemResources\.star\.setOpacity\(\s*smoothStepRange\(0\.80, 1\.0, exploration\.blend\)/.test(
      source,
    )
      && /agentTheory\s*\?\s*\"0\.80, 1\.0\"/.test(hotspotMaterial),
    "two-second entry final 20%",
  ],
  [
    "InstancedMesh shader relies on the Three.js injected instanceColor",
    sphereLayer.length > 0
      && !/attribute vec3 instanceColor/.test(sphereLayer)
      && /vColor = instanceColor/.test(sphereLayer)
      && /core\.instanceColor\.needsUpdate = true/.test(sphereLayer)
      && /corona\.instanceColor\.needsUpdate = true/.test(sphereLayer),
    "no duplicate instanceColor declaration",
  ],
  [
    "Agent theory materials have diagnostic names",
    [
      "AgentTheoryPaperCore",
      "AgentTheoryPaperOptical",
      "AgentTheoryHotspotCorePSF",
      "AgentTheoryHotspotOpticalPSF",
      "AgentTheoryHotspotSphereCore",
      "AgentTheoryHotspotSphereCorona",
      "AgentTheoryDecorativeDeepField",
    ].every((name) => source.includes(name)),
    "named overview programs",
  ],
  [
    "Agent theory performs a real shader compile and link-status gate",
    /renderer\.debug\.checkShaderErrors = true/.test(source)
      && /renderer\.compile\(scene, camera\)/.test(source)
      && /gl\.LINK_STATUS/.test(source)
      && /agentTheoryInitialGateComplete/.test(source)
      && /readyGatePassed = true/.test(source),
    "compile before onReady",
  ],
  [
    "invalid WebGL programs stop RAF and report a runtime error",
    /function reportAgentTheoryRuntimeFailure/.test(source)
      && /runtimeActive = false/.test(source)
      && /cancelAnimationFrame\(frameId\)/.test(source)
      && /onRuntimeErrorRef\.current\?\.\(message\)/.test(source),
    "fatal runtime gate",
  ],
  [
    "label offset uses the Agent optical radius",
    /agentOpticalDiameter/.test(source)
      && /visualProfile === \"agent-theory\"/.test(source),
    "drawLabels",
  ],
]) {
  addCheck(name, passed, detail);
}

const failed = checks.filter((check) => !check.passed);
const result = {
  audit: "agent-theory-stellar-material-v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  diagnostics: {
    paperSemanticChromaScale: [0.52, 0.78],
    hotspotCoreCssSize: [2.8, 5.2],
    hotspotOpticalCssSize: [5.5, 10],
    hotspotOpticalOpacityMaximum: 0.10,
    overviewEntityPasses:
      "point/psf only; true photosphere begins in the final 400ms of system entry",
  },
  checks,
  failedChecks: failed,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
