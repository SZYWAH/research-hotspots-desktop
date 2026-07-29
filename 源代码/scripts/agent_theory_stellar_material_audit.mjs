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
    "Agent theory core size is 5-10px",
    /mix\(5\.0, 10\.0, importance\)/.test(hotspotMaterial),
    "core LOD",
  ],
  [
    "Agent theory optical size is 10-20px",
    /mix\(10\.0, 20\.0, importance\)/.test(hotspotMaterial),
    "optical LOD",
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
    "Agent hotspot uses a compact stellar core rather than a full disc",
    /compactCore/.test(agentHotspotFragment)
      && /shortSpike/.test(agentHotspotFragment)
      && !/directionalLight|Lambert/i.test(agentHotspotFragment),
    "hybrid stellar LOD",
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
    hotspotCoreCssSize: [5, 10],
    hotspotOpticalCssSize: [10, 20],
    hotspotCoronaOpacityMaximum: 0.10,
    overviewEntityPasses: 2,
  },
  checks,
  failedChecks: failed,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
