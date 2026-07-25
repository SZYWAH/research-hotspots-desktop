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
  createHotspotLayer: "a69b02954f91d5b52843801aac2ed277ae06390bf355c445be9a950b1b2bebcf",
  createHotspotPointSourceMaterial: "de9cb3380f54fb3b9d7157ab77d5fed28bafa3382fd4dc7b5a750eef4bbb10a4",
  createPaperMaterial: "c7e6e784a9825481d9b95d359c24d4e77fe03ba44512445aaaaf215a7bdfdc48",
};
for (const [name, hash] of Object.entries(expected)) {
  const actual = createHash("sha256").update(functionSource(name)).digest("hex");
  assert.equal(actual, hash, `${name} visual implementation changed`);
}
assert(source.includes("const APP17_SYSTEM_INNER_ORBIT_PERIOD_SECONDS = 90;"));
assert(source.includes("const APP17_SYSTEM_OUTER_ORBIT_PERIOD_SECONDS = 210;"));
assert(source.includes("const APP17_FAR_ROTATION_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(0.045);"));
assert(source.includes("resources.representativePapers.forEach((paper) => {"));
assert(source.includes("uOverviewFarBlend"), "theory overview distance LOD is missing");
assert(source.includes("mix(1.0, 0.62, uOverviewFarBlend)"), "paper far-size LOD changed");
assert(source.includes("mix(1.0, 0.45, uOverviewFarBlend)"), "hotspot halo/ray far LOD changed");

console.log(JSON.stringify({
  pass: true,
  preserved: [
    "ordinary-paper shader and breathing",
    "representative energy profile and orbit update",
    "environment star twinkle",
    "distant hotspot material and slow rotation",
  ],
}, null, 2));
