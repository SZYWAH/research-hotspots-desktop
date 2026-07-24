import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const source = await readFile("src/components/App17GalaxyCanvas.tsx", "utf8");

function functionSource(name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `missing ${name}`);
  const bodyStart = source.indexOf("{", start);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") depth += 1;
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  throw new Error(`unterminated ${name}`);
}

const expected = {
  createSystemPaperLayer: "d6470352fcf7fb175e2359a7606677879b3707c3cb9f773c91c8d8f8632111f5",
  createRepresentativeEnergyProfile: "788952322d7bd39a265de1d5b76ec24ebd384e43c64bb5601e9591dca8ec5b05",
  createEnvironmentStarLayer: "adac17bf6579840c85472102b2215a9e348eac86c30d71f0970cb49e679f4f88",
  createHotspotLayer: "d61f1bc1c0b124e8cb82deda98ee42ee16a1662598f22c5655fc86a07e112c9c",
  createHotspotPointSourceMaterial: "5ab89cdb563b61704f4459d5e783b9c817a47738c09c21c1ad9a9fc116cbb766",
};
for (const [name, hash] of Object.entries(expected)) {
  const actual = createHash("sha256").update(functionSource(name)).digest("hex");
  assert.equal(actual, hash, `${name} visual implementation changed`);
}
assert(source.includes("const APP17_SYSTEM_INNER_ORBIT_PERIOD_SECONDS = 90;"));
assert(source.includes("const APP17_SYSTEM_OUTER_ORBIT_PERIOD_SECONDS = 210;"));
assert(source.includes("const APP17_FAR_ROTATION_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(0.045);"));
assert(source.includes("resources.representativePapers.forEach((paper) => {"));

console.log(JSON.stringify({
  pass: true,
  preserved: [
    "ordinary-paper shader and breathing",
    "representative energy profile and orbit update",
    "environment star twinkle",
    "distant hotspot material and slow rotation",
  ],
}, null, 2));
