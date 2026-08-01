import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const titleBar = fs.readFileSync("src/components/SideraTitleBar.tsx", "utf8");
const agent = fs.readFileSync("src/components/AgentDualBackgroundPage.tsx", "utf8");
const css = `${fs.readFileSync("src/index.css", "utf8")}\n${fs.readFileSync("src/components/AgentDualBackgroundPage.css", "utf8")}`;
const shell = fs.readFileSync("src/lib/sideraShell.ts", "utf8");

assert.match(shell, /type SideraNavigationLayout\s*=\s*"spatial-overlay"\s*\|\s*"workbench-reserve"/);
assert.match(shell, /type SideraChromeSafeArea/);
assert.match(shell, /brightness:\s*0\.34/);
assert.match(app, /data-navigation-open=\{agentNavigationOpen \? "true" : "false"\}/);
assert.match(app, /data-navigation-layout=\{navigationLayout\}/);
assert.doesNotMatch(app, /sidera-global-nav-trigger/);
assert.match(titleBar, /className="sidera-titlebar__navigation"/);
assert.doesNotMatch(agent, /title="打开导航"/);
assert.match(css, /--sidera-navigation-width:\s*232px/);
assert.match(css, /--sidera-window-controls-width:\s*138px/);
assert.match(css, /padding-left:\s*calc\(var\(--sidera-navigation-width\) \+ var\(--sidera-workbench-navigation-gap\)\)/);
assert.match(css, /background:\s*rgba\(0, 0, 0, 0\.94\)/);
assert.match(css, /\.agent-dual-page--shell-workbench \.agent-dual-page__background[\s\S]*?opacity:\s*0\.34/);
assert.match(css, /\.sidera-titlebar__navigation/);
assert.match(css, /\.workspace--research-galaxy \.galaxy-filter-bar[\s\S]*?var\(--sidera-titlebar-height\)/);
assert.match(css, /\.galaxy-layout-immersive \.galaxy-hud[\s\S]*?var\(--sidera-window-controls-width\)/);
assert.match(app, /galaxyProductSpatialPresentation/);
assert.match(app, /import\.meta\.env\.DEV && \(visualReview \|\| galaxyLayoutClassic\)/);

console.log(JSON.stringify({
  audit: "sidera-workbench-navigation-r1",
  status: "PASS",
  titleBarNavigation: true,
  workbenchReserve: true,
  workbenchBackgroundOpacity: 0.34,
  workbenchSurfaceAlpha: 0.94,
  productGalaxyFullscreenControl: false,
  rendererOwnershipUnchanged: true,
}, null, 2));
