import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");
const shell = fs.readFileSync("src/lib/sideraShell.ts", "utf8");
const galaxyCanvas = fs.readFileSync("src/components/App17GalaxyCanvas.tsx", "utf8");

assert.match(app, /activeView === "galaxy"[\s\S]*?"research-galaxy"/);
assert.match(app, /\{active && app17FilteredPayload\?\.ready \? \(/);
assert.match(app, /import\.meta\.env\.DEV && visualReview \? \(/);
assert.match(app, /galaxyProductSpatialPresentation\s*=\s*!visualReview && !galaxyLayoutClassic/);
assert.match(app, /fullscreen=\{galaxyPresentationFullscreen\}/);
assert.match(app, /import\.meta\.env\.DEV && \(visualReview \|\| galaxyLayoutClassic\) \? \(/);
assert.match(css, /\.galaxy-layout-immersive \.galaxy-hud[\s\S]*?right:\s*calc\(var\(--sidera-window-controls-width\) \+ var\(--sidera-chrome-control-gap\)\)/);
assert.match(css, /\.workspace--research-galaxy \.galaxy-panel-3d,[\s\S]*?\.workspace--research-galaxy \.galaxy-stage-reference\s*\{\s*background:\s*#000;/);
assert.match(css, /\.workspace--research-galaxy \.galaxy-stage-3d::after\s*\{[\s\S]*?background:\s*none;/);
assert.match(galaxyCanvas, /scene\.background = visualProfile === "analysis" \? new THREE\.Color\(0x000000\) : null/);
assert.match(galaxyCanvas, /renderer\.setClearColor\(0x000000, visualProfile === "analysis" \? 1 : 0\)/);
assert.match(app, /onSpatialStateChange=\{setPipelineSpatialState\}/);
assert.match(shell, /type SideraPipelineSpatialState[\s\S]*?active:\s*boolean[\s\S]*?progress:\s*number[\s\S]*?paused:\s*boolean/);
assert.match(app, /pipelineSpatialState\.active[\s\S]*?"pipeline-formation"/);

console.log(JSON.stringify({
  audit: "sidera-spatial-pages",
  status: "PASS",
  researchGalaxyExclusive: true,
  classicLayoutProductEntry: false,
  productFullscreenButton: false,
  productBackground: "#000000-css-and-webgl",
  chromeSafeHud: true,
  pipelineFormationContract: true,
  formationAnimationDeferred: true,
}, null, 2));
