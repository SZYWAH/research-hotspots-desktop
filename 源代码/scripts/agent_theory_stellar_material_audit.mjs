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
    "Agent theory core size follows projected angular diameter",
    /float angularCssDiameter = worldDiameter/.test(hotspotMaterial)
      && /clamp\(angularCssDiameter, 1\.0, 16\.0\)/.test(hotspotMaterial)
      && /\* \$\{APP15_COORD_SCALE\.toFixed\(4\)\}/.test(hotspotMaterial),
    "angular core LOD",
  ],
  [
    "Agent theory optical size follows the bounded PSF shoulder",
    /clamp\(angularCssDiameter \* 1\.45, 1\.0, 24\.0\)/.test(
      hotspotMaterial,
    ),
    "optical PSF LOD",
  ],
  [
    "optical corona opacity is capped at 10%",
    /min\(0\.10, haloEnergy \+ rayEnergy\)/.test(hotspotMaterial),
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
    /coreTightness/.test(agentHotspotFragment)
      && /shoulder/.test(agentHotspotFragment)
      && /shortSpike/.test(agentHotspotFragment)
      && !/directionalLight|Lambert/i.test(agentHotspotFragment),
    "hybrid stellar LOD",
  ],
  [
    "nearby Agent hotspots use no more than 12 shared sphere slots",
    /const maximumSlots = 12/.test(source)
      && /new THREE\.InstancedMesh\(geometry, coreMaterial, maximumSlots\)/.test(
        source,
      ),
    "resolved hotspot sphere LOD",
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
      "AgentTheoryPaperPSF",
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
    hotspotCoreCssSize: [1, 16],
    hotspotOpticalCssSize: [1, 24],
    hotspotCoronaOpacityMaximum: 0.10,
    overviewEntityPasses: "point/psf plus at most 12 resolved sphere slots",
  },
  checks,
  failedChecks: failed,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
