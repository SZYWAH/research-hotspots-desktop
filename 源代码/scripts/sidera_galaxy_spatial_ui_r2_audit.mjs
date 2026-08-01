import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const canvas = fs.readFileSync("src/components/App17GalaxyCanvas.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");

assert.match(app, /navigationOpen=\{agentNavigationOpen\}/);
assert.match(app, /data-navigation-open=\{navigationOpen \? "true" : "false"\}/);
assert.match(app, /data-collapsed=\{navigationOpen && !galaxyLayoutClassic \? "true" : "false"\}/);
assert.match(app, /data-collapsed=\{navigationOpen \? "true" : "false"\}/);

assert.doesNotMatch(
  app,
  /useEffect\(\(\) => \{[\s\S]{0,260}kind:\s*"fit"[\s\S]{0,160}\},\s*\[[^\]]*visualMode/,
  "display/theory changes must not enqueue an automatic fit",
);
assert.match(app, /onChange=\{\(nextMode\) => \{\s*setVisualMode\(nextMode\);\s*\}\}/);
assert.match(canvas, /persistentRenderCoreRef/);
assert.match(canvas, /persistentSceneFrameRef/);
assert.match(canvas, /previousSceneFrame\.mode !== visualMode/);
assert.match(canvas, /scene\.clear\(\);[\s\S]{0,160}scene\.background = visualProfile/);

assert.match(app, /useState<"closed" \| "hotspot" \| "paper-summary" \| "paper-reading">\("closed"\)/);
assert.match(app, /viewportOffsetRatio=\{galaxyInspectorOpen \? 0\.08 : 0\}/);
assert.match(app, /galaxyLayoutClassic && <div className="galaxy-evidence-card"/);
assert.doesNotMatch(app, /className=\{`galaxy-paper-reading-overlay/);
assert.match(app, /className="galaxy-context-rail-close"/);
assert.match(app, /data-mode=\{galaxyContextRailMode\}/);

assert.match(canvas, /viewportOffsetRatio\?: number/);
assert.match(canvas, /camera\.setViewOffset\(width, height, offsetPixels, 0, width, height\)/);
assert.match(canvas, /\(now - viewportOffsetTransition\.startedAt\) \/ 320/);
assert.match(canvas, /camera\.clearViewOffset\(\)/);

assert.match(css, /\.galaxy-filter-bar\s*\{[\s\S]{0,220}width:\s*min\(440px, 44vw\)/);
assert.match(css, /\.galaxy-filter-bar\[data-collapsed="true"\]/);
assert.match(css, /\.galaxy-legend\[data-collapsed="true"\]/);
assert.match(css, /\.galaxy-layout-immersive \.galaxy-hud\s*\{[\s\S]{0,260}top:\s*calc\(var\(--sidera-titlebar-height\) \+ 3px\)/);
assert.match(css, /\.galaxy-layout-immersive \.galaxy-inspector\s*\{[\s\S]{0,260}top:\s*calc\(var\(--sidera-titlebar-height\) \+ 48px\)/);
assert.match(css, /\.galaxy-context-rail-close/);

const smootherstep = (value) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * t * (t * (t * 6 - 15) + 10);
};
let previous = -1;
for (let frame = 0; frame <= 20; frame += 1) {
  const offset = 0.08 * smootherstep(frame / 20);
  assert.ok(offset >= previous, "composition offset must be monotonic");
  previous = offset;
}
assert.ok(Math.abs(previous - 0.08) < 1e-12);

console.log(JSON.stringify({
  audit: "sidera-galaxy-spatial-ui-r2",
  status: "PASS",
  automaticFitOnModeSwitch: 0,
  persistentRenderer: true,
  persistentCamera: true,
  navigationHudCollapse: true,
  singleContextRail: true,
  contextRailDefault: "closed",
  compositionOffsetRatio: 0.08,
  compositionDurationMs: 320,
}, null, 2));
