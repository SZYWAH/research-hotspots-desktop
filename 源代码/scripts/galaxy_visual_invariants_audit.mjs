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

function displayHotspotLayerSource() {
  return functionSource("createHotspotLayer")
    .replace("  const crossfadeMasks = new Float32Array(count);\n", "")
    .replace(
      [
        "  const crossfadeMaskAttribute = new THREE.BufferAttribute(crossfadeMasks, 1);",
        '  geometry.setAttribute("crossfadeMask", crossfadeMaskAttribute);',
        "",
      ].join("\n"),
      "",
    )
    .replace(
      [
        '    setTheoryFarTransitionModes: (modeByTopic: Map<string, "retreat" | "crossfade">) => {',
        "      for (let index = 0; index < crossfadeMasks.length; index += 1) {",
        '        crossfadeMasks[index] = modeByTopic.get(topicKeys[index]) === "crossfade" ? 1 : 0;',
        "      }",
        "      crossfadeMaskAttribute.needsUpdate = true;",
        "    },",
      ].join("\n"),
      "",
    );
}

const expected = {
  createSystemPaperLayer: "d6470352fcf7fb175e2359a7606677879b3707c3cb9f773c91c8d8f8632111f5",
  createRepresentativeEnergyProfile: "788952322d7bd39a265de1d5b76ec24ebd384e43c64bb5601e9591dca8ec5b05",
  createEnvironmentStarLayer: "adac17bf6579840c85472102b2215a9e348eac86c30d71f0970cb49e679f4f88",
};
for (const [name, hash] of Object.entries(expected)) {
  const actual = createHash("sha256").update(functionSource(name)).digest("hex");
  assert.equal(actual, hash, `${name} visual implementation changed`);
}
assert.equal(
  createHash("sha256").update(displayHotspotLayerSource().replace(/\s+/g, "")).digest("hex"),
  "e3e4dd2c0dbd157aa08f931c6584893e632c5c8c6f87642179e689d073d7cf86",
  "createHotspotLayer display implementation changed",
);
assert(source.includes("const APP17_SYSTEM_INNER_ORBIT_PERIOD_SECONDS = 90;"));
assert(source.includes("const APP17_SYSTEM_OUTER_ORBIT_PERIOD_SECONDS = 210;"));
assert(source.includes("const APP17_FAR_ROTATION_RADIANS_PER_SECOND = THREE.MathUtils.degToRad(0.045);"));
assert(source.includes("resources.representativePapers.forEach((paper) => {"));
assert(source.includes("uOverviewFarBlend"), "theory overview distance LOD is missing");
assert(source.includes("mix(1.0, 0.62, uOverviewFarBlend)"), "paper far-size LOD changed");
assert(source.includes("mix(1.0, 0.45, uOverviewFarBlend)"), "hotspot halo/ray far LOD changed");
const paperMaterialSource = functionSource("createPaperMaterial");
const hotspotMaterialSource = functionSource("createHotspotPointSourceMaterial");
assert(
  paperMaterialSource.includes(
    `: \`mix(1.0, \${APP17_FAR_SCENE_SCALE.toFixed(1)}, uExplorationProgress)\``,
  ),
  "display paper retreat behavior changed",
);
assert(
  paperMaterialSource.includes(
    `: \`mix(1.0, \${APP17_FAR_PAPER_OPACITY.toFixed(2)}, isolationProgress)\``,
  ),
  "display paper opacity behavior changed",
);
assert(
  hotspotMaterialSource.includes(
    `: \`mix(1.0, \${APP17_FAR_SCENE_SCALE.toFixed(1)}, uExplorationProgress)\``,
  ),
  "display hotspot retreat behavior changed",
);
assert(
  /kind === "app15" \? "[^"]+" : "0\.32, 0\.76"/.test(hotspotMaterialSource),
  "display selected hotspot handoff changed",
);
assert(
  hotspotMaterialSource.includes(
    `: \`mix(1.0, \${APP17_FAR_HOTSPOT_CORE_OPACITY.toFixed(2)}, isolationProgress)\``,
  ),
  "display hotspot opacity behavior changed",
);

console.log(JSON.stringify({
  pass: true,
  preserved: [
    "ordinary-paper shader and breathing",
    "representative energy profile and orbit update",
    "environment star twinkle",
    "distant hotspot material and slow rotation",
  ],
}, null, 2));
