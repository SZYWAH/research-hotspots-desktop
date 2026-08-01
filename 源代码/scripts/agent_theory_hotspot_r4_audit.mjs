import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "src",
    "components",
    "App17GalaxyCanvas.tsx",
  ),
  "utf8",
);

const extract = (pattern) => source.match(pattern)?.[0] ?? "";
const hotspotLayer = extract(
  /function createHotspotLayer\([\s\S]*?\n}\n\nfunction createAgentTheoryHotspotSphereLayer/,
);
const overviewSphereLayer = extract(
  /function createAgentTheoryHotspotSphereLayer\([\s\S]*?\n}\n\nfunction setAgentDepthRangeOnObject/,
);
const hotspotMaterial = extract(
  /function createHotspotPointSourceMaterial\([\s\S]*?\n}\n\nfunction createFocusMaterial/,
);
const systemStar = extract(
  /function createSystemStar\([\s\S]*?\n}\n\nfunction createSystemMagneticLayer/,
);
const systemCorona = extract(
  /function createSystemImpostorMaterial\([\s\S]*?\n}\n\nfunction createEnvironmentStarLayer/,
);
const labels = extract(
  /function drawLabels\([\s\S]*?\n}\n\nfunction stableShuffleHotspotsApp14/,
);

const checks = [];
const add = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

add(
  "overview hotspot core is a 1.1-1.6px native-resolution source",
  /mix\(1\.1, 1\.52, pow\(importance, 0\.72\)\)/.test(hotspotMaterial)
    && /clamp\(stagedCssSize, 1\.1, 1\.6\)/.test(hotspotMaterial)
    && /depthWrite: agentTheory && !opticalPass/.test(hotspotMaterial),
  "compact core, normal blending, depth write",
);
add(
  "overview optical shoulder is 5-11px and non-circular",
  /mix\(5\.0, 10\.4, pow\(importance, 0\.72\)\)/.test(hotspotMaterial)
    && /clamp\(stagedCssSize, 5\.0, 11\.0\)/.test(hotspotMaterial)
    && /shoulderPoint/.test(hotspotMaterial)
    && /shoulderAngle/.test(hotspotMaterial)
    && /contour/.test(hotspotMaterial)
    && /min\(0\.12, shoulderEnergy \+ rayEnergy\)/.test(hotspotMaterial),
  "elliptical seeded shoulder with a 12% optical cap",
);
add(
  "short rays are stable per hotspot and slightly asymmetric",
  /vStellarSeed = fract\(breathPhase/.test(hotspotMaterial)
    && /horizontalSpike/.test(hotspotMaterial)
    && /verticalSpike/.test(hotspotMaterial)
    && /mix\(1\.08, 0\.86, vStellarSeed\)/.test(hotspotMaterial)
    && /mix\(0\.82, 1\.05, vStellarSeed\)/.test(hotspotMaterial)
    && /breathAmplitudes\[index\] = visualProfile === "agent-theory"\s*\?\s*0/.test(
      hotspotLayer,
    ),
  "ID-seeded static morphology; no Agent hotspot breathing",
);
add(
  "Ambient and Explore never allocate overview sphere ownership",
  /resolveAgentTheoryStellarLod\(\s*diameter,\s*false,\s*previousLod,\s*\)/.test(
    overviewSphereLayer,
  )
    && !/resolveAgentTheoryStellarLod\(\s*diameter,\s*true,\s*previousLod,\s*\)/.test(
      overviewSphereLayer,
    ),
  "overview layer resolves only point/psf/near-psf",
);
add(
  "the true photosphere crossfades only in the final 400ms",
  /systemResources\.star\.setOpacity\(\s*smoothStepRange\(0\.80, 1\.0, exploration\.blend\)/.test(
    source,
  )
    && /agentTheory\s*\?\s*"0\.80, 1\.0"/.test(hotspotMaterial)
    && /APP17_SYSTEM_TRANSITION_MS = 2_000/.test(source),
  "final 20% of the two-second entry",
);
add(
  "local photosphere uses stronger limb darkening and reduced white wash",
  /float limb = mix\(0\.38, 1\.0, pow\(facing, 0\.46\)\)/.test(systemStar)
    && /mix\(vec3\(fieldLuminance\), uColor, 0\.78\)/.test(systemStar)
    && /0\.28 \+ hotRegion \* 0\.06/.test(systemStar)
    && /centerHeat \* 0\.035/.test(systemStar)
    && /cellNetwork \* uSurfaceDetailBlend \* 0\.16/.test(systemStar),
  "self-luminous surface retains semantic temperature and visible structure",
);
add(
  "local corona is thin, bounded, and non-concentric",
  /nextProjectedDiameter \* 0\.095/.test(systemStar)
    && /,\s*7,\s*34,\s*\)/.test(systemStar)
    && /angle \* 5\.0/.test(systemCorona)
    && /angle \* 3\.0/.test(systemCorona)
    && /float coronaEnergy = min\(\s*0\.12/.test(systemCorona)
    && /uCoronaCssExtension \* 0\.26/.test(systemCorona),
  "two seeded contours, shorter decay, 12% maximum corona energy",
);
add(
  "Agent labels follow the real 5-11px optical footprint",
  /const agentOpticalDiameter = 5 \+ Math\.pow\(hotspot\.importance, 0\.72\) \* 6/.test(
    labels,
  )
    && /Math\.max\(11, agentOpticalDiameter \* 0\.5 \+ 5\.5\)/.test(labels)
    && /rgba\(241,247,255,0\.82\)/.test(labels),
  "smaller offset, lighter hierarchy, lower non-priority opacity",
);
add(
  "overview passes share one business entity and picking owner",
  /new THREE\.Points\(geometry, coreMaterial\)/.test(hotspotLayer)
    && /new THREE\.Points\(geometry, opticalMaterial\)/.test(hotspotLayer)
    && /pickObject: coreObject/.test(hotspotLayer),
  "core and optical PSF share geometry and hotspot index",
);

const failed = checks.filter((check) => !check.passed);
const result = {
  audit: "agent-theory-hotspot-r4-v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  diagnostics: {
    overviewCoreCssSize: [1.1, 1.6],
    overviewOpticalCssSize: [5, 11],
    overviewSphereSlots: 0,
    systemPhotosphereCrossfadeMs: 400,
    localCoronaEnergyMaximum: 0.12,
  },
  checks,
  failedChecks: failed,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length > 0) process.exitCode = 1;
