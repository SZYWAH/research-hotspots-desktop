import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const sourcePath = path.join(
  process.cwd(),
  "src",
  "components",
  "AgentImmersiveStarfieldCanvas.tsx",
);
const source = fs.readFileSync(sourcePath, "utf8");
const checks = [];
const addCheck = (name, passed, detail) => {
  checks.push({ name, passed: Boolean(passed), detail });
};

const fnv1a32 = (value) => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

const mulberry32 = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const seedPhase = (seed) => (
  fnv1a32(`immersive-flow-v1\u0000${seed}`) / 4294967296
) * Math.PI * 2;

const velocity = (position, type, time, phase) => {
  const [x, y, z] = position;
  const macro = [
    (Math.sin(y * 0.085 + time * 0.105 + phase)
      + Math.cos(z * 0.064 - time * 0.082 + phase * 0.37)) * 0.034,
    (Math.sin(z * 0.078 + time * 0.074 + phase * 0.71)
      - Math.cos(x * 0.058 + time * 0.066 - phase * 0.29)) * 0.026,
    (Math.sin(x * 0.071 - time * 0.093 + phase * 0.53)
      + Math.cos(y * 0.112 + time * 0.058 + phase * 0.19)) * 0.034,
  ];
  const curl = [
    (Math.cos(y * 0.39 + time * 0.27 + phase * 1.13)
      - Math.sin(z * 0.31 - time * 0.33 + phase * 0.83)) * 0.019,
    (Math.cos(z * 0.36 - time * 0.29 + phase * 0.61)
      - Math.sin(x * 0.43 + time * 0.31 - phase * 0.47)) * 0.015,
    (Math.cos(x * 0.38 + time * 0.34 - phase * 0.73)
      - Math.sin(y * 0.40 - time * 0.27 + phase * 0.41)) * 0.019,
  ];
  const normalized = [Math.abs(x) / 45, Math.abs(y) / 18, Math.abs(z) / 45];
  const edge = Math.max(...normalized);
  const edgeWeight = edge <= 0.84 ? 0 : Math.min(1, (edge - 0.84) / 0.16);
  const calmRadius = Math.sqrt(
    x * x / 100
    + y * y / 30.25
    + z * z / 169,
  );
  const calmWeight = calmRadius >= 1
    ? 0
    : calmRadius <= 0.35
      ? 1
      : (1 - calmRadius) / 0.65;
  const scale = (1 - calmWeight * 0.30) * (type > 0.5 ? 0.72 : 1);
  return macro.map((value, axis) => (
    (value + curl[axis]) * (1 - edgeWeight * 0.72)
    - Math.sign(position[axis] || 1) * normalized[axis] * edgeWeight * 0.16
  ) * scale * 1.25);
};

const writeRandomPosition = (random, radiusLimit) => {
  const radius = random() * radiusLimit;
  const theta = random() * Math.PI * 2;
  const phi = Math.acos(2 * random() - 1);
  return [
    radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.sin(phi) * Math.sin(theta) * 0.4,
    radius * Math.cos(phi),
  ];
};

const createParticles = (seed) => {
  const particles = [];
  for (let index = 0; index < 160; index += 1) {
    const random = mulberry32(fnv1a32(`${seed}\u0000hotspot\u0000${index}`));
    particles.push({
      type: 1,
      position: writeRandomPosition(random, 18),
    });
  }
  for (let index = 0; index < 6000; index += 1) {
    const random = mulberry32(fnv1a32(`${seed}\u0000paper\u0000${index}`));
    particles.push({
      type: 0,
      position: writeRandomPosition(random, 45),
    });
  }
  return particles;
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

const percentile = (values, fraction) => {
  const index = Math.max(
    0,
    Math.min(values.length - 1, Math.round((values.length - 1) * fraction)),
  );
  return values[index] ?? 0;
};

const runFiveSeconds = (seed) => {
  const particles = createParticles(seed);
  const phase = seedPhase(seed);
  const initial = particles.map((particle) => project(particle.position));
  const velocities = particles.map((particle) => (
    velocity(particle.position, particle.type, 0, phase)
  ));
  const delta = 1 / 60;
  const response = 1 - Math.exp(-delta * 1.35);
  let boundaryTurns = 0;
  for (let step = 1; step <= 300; step += 1) {
    const time = step * delta;
    particles.forEach((particle, index) => {
      const target = velocity(particle.position, particle.type, time, phase);
      for (let axis = 0; axis < 3; axis += 1) {
        velocities[index][axis] += (target[axis] - velocities[index][axis]) * response;
        particle.position[axis] += velocities[index][axis] * delta;
      }
      const edge = Math.max(
        Math.abs(particle.position[0]) / 45,
        Math.abs(particle.position[1]) / 18,
        Math.abs(particle.position[2]) / 45,
      );
      if (edge > 0.84) boundaryTurns += 1;
    });
  }

  const distances = [];
  let sumX = 0;
  let sumY = 0;
  let energy = 0;
  particles.forEach((particle, index) => {
    const start = initial[index];
    const end = project(particle.position);
    if (!start || !end) return;
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    distances.push(Math.hypot(dx, dy));
    sumX += dx;
    sumY += dy;
    energy += dx * dx + dy * dy;
  });
  distances.sort((left, right) => left - right);
  const count = Math.max(1, distances.length);
  const meanX = sumX / count;
  const meanY = sumY / count;
  return {
    visibleCount: distances.length,
    median: percentile(distances, 0.5),
    p75: percentile(distances, 0.75),
    p95: percentile(distances, 0.95),
    movedOver3Ratio: distances.filter((value) => value > 3).length / count,
    directionality: energy > 1e-9
      ? count * (meanX * meanX + meanY * meanY) / energy
      : 0,
    boundaryTurns,
    coordinateHash: crypto
      .createHash("sha256")
      .update(JSON.stringify(particles.map((particle) => particle.position)))
      .digest("hex"),
  };
};

for (const [description, pattern] of [
  ["128x64 state texture", /FLOW_TEXTURE_WIDTH = 128[\s\S]*FLOW_TEXTURE_HEIGHT = 64/],
  ["fixed 1/60 integration", /FLOW_FIXED_STEP_SECONDS = 1 \/ 60/],
  ["maximum three catch-up steps", /FLOW_MAX_STEPS_PER_FRAME = 3/],
  ["float Ping-Pong render targets", /createFloatStateTarget[\s\S]*positions: \[createFloatStateTarget\(\), createFloatStateTarget\(\)\]/],
  ["analytic fallback", /AgentImmersiveFlowBackend = \"gpgpu\" \| \"analytic-fallback\"/],
  ["context-lost fallback", /webglcontextlost/],
  ["checkpoint contains positions and velocities", /AgentImmersiveFlowCheckpointV1[\s\S]*positions: Float32Array[\s\S]*velocities: Float32Array/],
]) {
  addCheck(description, pattern.test(source), String(pattern));
}

const coreFragment = source.match(/const CORE_FRAGMENT_SHADER = `([\s\S]*?)`;/)?.[1] ?? "";
addCheck(
  "semantic core fragment has no time opacity",
  !/uTime|sin\s*\([^)]*time|opacity.*time/i.test(coreFragment),
  "CORE_FRAGMENT_SHADER",
);
addCheck(
  "no coordinate modulo or particle respawn",
  !/mod\s*\(\s*position|respawn|reseed|wrapPosition/i.test(source),
  "source scan",
);

const first = runFiveSeconds("m1.3e-audit-seed");
const repeated = runFiveSeconds("m1.3e-audit-seed");
const different = runFiveSeconds("m1.3e-audit-seed-b");
addCheck(
  "same seed and step count are deterministic",
  first.coordinateHash === repeated.coordinateHash,
  first.coordinateHash,
);
addCheck(
  "different seed changes the starfield",
  first.coordinateHash !== different.coordinateHash,
  `${first.coordinateHash} != ${different.coordinateHash}`,
);
addCheck(
  "at least half of visible papers move more than 3px",
  first.movedOver3Ratio >= 0.50,
  first.movedOver3Ratio,
);
addCheck(
  "five-second median displacement is 3-6px",
  first.median >= 3 && first.median <= 6,
  first.median,
);
addCheck(
  "five-second P75 displacement is 8-12px",
  first.p75 >= 8 && first.p75 <= 12,
  first.p75,
);
addCheck(
  "five-second P95 displacement does not exceed 20px",
  first.p95 <= 20,
  first.p95,
);
addCheck(
  "global direction energy remains below 35%",
  first.directionality < 0.35,
  first.directionality,
);

const failed = checks.filter((check) => !check.passed);
const result = {
  audit: "agent-immersive-two-level-flow-v1",
  generatedAt: new Date().toISOString(),
  status: failed.length === 0 ? "PASS" : "FAIL",
  metrics: first,
  comparisonSeedMetrics: different,
  checks,
  failedChecks: failed,
};
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
if (failed.length) process.exitCode = 1;
