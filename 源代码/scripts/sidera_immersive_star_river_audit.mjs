import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  AGENT_IMMERSIVE_DUST_COUNT,
  AGENT_IMMERSIVE_STAR_RIVER_VERSION,
  createAgentStarRiverParticle,
  flowSeedPhase,
  sampleAgentStarRiverFrame,
  sampleAgentStarRiverPosition,
  sampleAgentStarRiverVelocity,
} from "../src/lib/agentImmersiveStarRiver.ts";

const root = process.cwd();
const canvasSource = fs.readFileSync(path.join(
  root,
  "src/components/AgentImmersiveStarfieldCanvas.tsx",
), "utf8");
const pageSource = fs.readFileSync(path.join(
  root,
  "src/components/AgentDualBackgroundPage.tsx",
), "utf8");
const riverSource = fs.readFileSync(path.join(
  root,
  "src/lib/agentImmersiveStarRiver.ts",
), "utf8");

const checks = [];
const addCheck = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

const percentile = (values, fraction) => {
  const index = Math.max(
    0,
    Math.min(values.length - 1, Math.round((values.length - 1) * fraction)),
  );
  return values[index] ?? 0;
};

const project = ([x, y, z]) => {
  const depth = 25 - z;
  if (depth <= 0.1 || depth > 100) return undefined;
  const tangent = Math.tan(Math.PI / 6);
  const ndcX = x / (depth * tangent * 1.6);
  const ndcY = y / (depth * tangent);
  if (Math.abs(ndcX) > 1 || Math.abs(ndcY) > 1) return undefined;
  return [(ndcX * 0.5 + 0.5) * 1440, (-ndcY * 0.5 + 0.5) * 900];
};

const median = (values) => {
  const sorted = [...values].sort((left, right) => left - right);
  return percentile(sorted, 0.5);
};

const createSemanticParticles = (seed) => {
  const particles = [];
  for (let index = 0; index < 160; index += 1) {
    particles.push({
      id: `hotspot-${index}`,
      kind: "hotspot",
      ...createAgentStarRiverParticle(seed, `hotspot-${index}`, "hotspot", index, 160),
    });
  }
  for (let index = 0; index < 6000; index += 1) {
    particles.push({
      id: `paper-${index}`,
      kind: "paper",
      ...createAgentStarRiverParticle(seed, `paper-${index}`, "paper", index, 6000),
    });
  }
  return particles;
};

const runSample = (seed) => {
  const phase = flowSeedPhase(seed);
  const particles = createSemanticParticles(seed);
  const composition = { main: 0, branch: 0, outer: 0 };
  const distances = [];
  const centralSpeeds = [];
  const outerSpeeds = [];
  let directionX = 0;
  let directionY = 0;
  let directionEnergy = 0;
  let tangentAlignment = 0;
  let tangentCount = 0;
  let visibleCount = 0;

  for (const particle of particles) {
    if (particle.meta.band === 0) composition.main += 1;
    else if (particle.meta.band === 3) composition.outer += 1;
    else composition.branch += 1;
    const start = sampleAgentStarRiverPosition(
      particle.position,
      particle.meta,
      particle.kind,
      0,
      phase,
    );
    const end = sampleAgentStarRiverPosition(
      particle.position,
      particle.meta,
      particle.kind,
      5,
      phase,
    );
    const startScreen = project(start);
    const endScreen = project(end);
    if (particle.kind === "paper" && startScreen && endScreen) {
      const dx = endScreen[0] - startScreen[0];
      const dy = endScreen[1] - startScreen[1];
      distances.push(Math.hypot(dx, dy));
      directionX += dx;
      directionY += dy;
      directionEnergy += dx * dx + dy * dy;
      visibleCount += 1;
    }
    if (particle.kind === "paper" && particle.meta.band < 3) {
      const frame = sampleAgentStarRiverFrame(particle.meta.band, particle.meta.t, phase);
      const displacement = [
        end[0] - start[0],
        end[1] - start[1],
        end[2] - start[2],
      ];
      const length = Math.hypot(...displacement) || 1;
      tangentAlignment += Math.abs(
        displacement[0] * frame.tangent[0]
          + displacement[1] * frame.tangent[1]
          + displacement[2] * frame.tangent[2],
      ) / length;
      tangentCount += 1;
    }
    if (particle.kind === "paper") {
      const velocity = sampleAgentStarRiverVelocity(
        start,
        particle.position,
        particle.meta,
        particle.kind,
        0,
        phase,
      );
      const speed = Math.hypot(...velocity);
      const calmRadius = Math.sqrt(
        start[0] * start[0] / 100
          + start[1] * start[1] / 30.25
          + start[2] * start[2] / 169,
      );
      if (calmRadius < 0.85) centralSpeeds.push(speed);
      if (calmRadius > 1.4) outerSpeeds.push(speed);
    }
  }
  distances.sort((left, right) => left - right);
  const count = Math.max(1, distances.length);
  const meanX = directionX / count;
  const meanY = directionY / count;
  const serialized = particles.map((particle) => ({
    id: particle.id,
    position: particle.position,
    meta: particle.meta,
  }));
  return {
    coordinateHash: crypto.createHash("sha256").update(JSON.stringify(serialized)).digest("hex"),
    composition,
    visibleCount,
    displacementMedianPx: percentile(distances, 0.5),
    displacementP75Px: percentile(distances, 0.75),
    displacementP95Px: percentile(distances, 0.95),
    globalDirectionality: directionEnergy > 1e-9
      ? count * (meanX * meanX + meanY * meanY) / directionEnergy
      : 0,
    localTangentAlignment: tangentAlignment / Math.max(1, tangentCount),
    centralCalmSpeedRatio: median(centralSpeeds) / Math.max(1e-9, median(outerSpeeds)),
    centralSampleCount: centralSpeeds.length,
  };
};

const first = runSample("m1.3l-audit");
const repeated = runSample("m1.3l-audit");
const different = runSample("m1.3l-audit-b");
const semanticCount = 6160;
const mainRatio = first.composition.main / semanticCount;
const branchRatio = first.composition.branch / semanticCount;
const outerRatio = first.composition.outer / semanticCount;

addCheck(
  "state texture exactly hosts semantic, dynamic, and dust slots",
  6000 + 160 + 32 + AGENT_IMMERSIVE_DUST_COUNT === 128 * 64,
  `${6000 + 160 + 32 + AGENT_IMMERSIVE_DUST_COUNT}/8192`,
);
addCheck(
  "same seed produces deterministic flow metadata",
  first.coordinateHash === repeated.coordinateHash,
  first.coordinateHash,
);
addCheck(
  "different seed changes river detail",
  first.coordinateHash !== different.coordinateHash,
  `${first.coordinateHash} != ${different.coordinateHash}`,
);
addCheck("main band ratio remains near 72%", mainRatio >= 0.69 && mainRatio <= 0.75, mainRatio);
addCheck("branch ratio remains near 18%", branchRatio >= 0.15 && branchRatio <= 0.21, branchRatio);
addCheck("outer ratio remains near 10%", outerRatio >= 0.08 && outerRatio <= 0.12, outerRatio);
addCheck(
  "five-second median displacement is 4-8px",
  first.displacementMedianPx >= 4 && first.displacementMedianPx <= 8,
  first.displacementMedianPx,
);
addCheck(
  "five-second P75 displacement is 8-16px",
  first.displacementP75Px >= 8 && first.displacementP75Px <= 16,
  first.displacementP75Px,
);
addCheck(
  "five-second P95 displacement is at most 24px",
  first.displacementP95Px <= 24,
  first.displacementP95Px,
);
addCheck(
  "global movement does not collapse into a single translation",
  first.globalDirectionality < 0.45,
  first.globalDirectionality,
);
addCheck(
  "local movement follows the river tangent",
  first.localTangentAlignment >= 0.58,
  first.localTangentAlignment,
);
addCheck(
  "central calm remains roughly 60-75% of peripheral speed",
  first.centralCalmSpeedRatio >= 0.60 && first.centralCalmSpeedRatio <= 0.76,
  first.centralCalmSpeedRatio,
);

for (const [name, passed, detail] of [
  ["star-river layout has a versioned checkpoint", canvasSource.includes("agentImmersiveLayoutVersion(style)"), AGENT_IMMERSIVE_STAR_RIVER_VERSION],
  ["styles use separate checkpoint keys", pageSource.includes("immersive-flow-checkpoint:star-river-v1") && pageSource.includes("immersive-flow-checkpoint:v1"), "AgentDualBackgroundPage"],
  ["star-river is the default immersive style", /getItem\(IMMERSIVE_STYLE_STORAGE_KEY\) === "random-field"[\s\S]*\? "random-field"[\s\S]*: "star-river"/.test(pageSource), "readImmersiveStyle"],
  ["style control exposes both options", pageSource.includes("流动星河") && pageSource.includes("随机星海"), "more menu"],
  ["flow keeps a single 128x64 simulation", /FLOW_TEXTURE_WIDTH = 128[\s\S]*FLOW_TEXTURE_HEIGHT = 64/.test(canvasSource), "state texture"],
  ["dust uses spare state slots", canvasSource.includes("simulationTypes[simulationIndex] = 2") && canvasSource.includes("createDustGeometry"), "dust path"],
  ["three procedural nebula ribbons share one draw geometry", canvasSource.includes("createNebulaRibbon") && canvasSource.includes("for (let band = 0; band < 3"), "nebula ribbon"],
  ["semantic shader has no time-driven opacity", !/const CORE_FRAGMENT_SHADER = `[\s\S]*?opacity[\s\S]*?uTime/.test(canvasSource), "CORE_FRAGMENT_SHADER"],
  ["river source does not read theory coordinates or membership", !/sourceCentroid|isotropicScale|semanticOffset|membership|theoryPayload/.test(riverSource), "agentImmersiveStarRiver.ts"],
  ["river motion has no respawn or coordinate modulo", !/respawn|wrapPosition|mod\s*\(\s*position/i.test(riverSource + canvasSource), "source scan"],
]) {
  addCheck(name, passed, detail);
}

const failedChecks = checks.filter((check) => !check.passed);
const result = {
  audit: "sidera-immersive-star-river-v1",
  generatedAt: new Date().toISOString(),
  status: failedChecks.length === 0 ? "PASS" : "FAIL",
  layoutVersion: AGENT_IMMERSIVE_STAR_RIVER_VERSION,
  metrics: first,
  comparisonSeedMetrics: different,
  checks,
  failedChecks,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failedChecks.length > 0) process.exitCode = 1;
