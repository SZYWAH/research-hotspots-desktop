import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const titlebar = fs.readFileSync("src/components/SideraTitleBar.tsx", "utf8");
const canvas = fs.readFileSync("src/components/App17GalaxyCanvas.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");

assert.match(titlebar, /toolsHostRef\?: RefCallback<HTMLDivElement>/);
assert.match(titlebar, /className="sidera-titlebar__tools"/);
assert.doesNotMatch(titlebar, /onOpenNavigation|sidera-titlebar__navigation|<Menu/);
assert.match(app, /createPortal\([\s\S]*galaxy-titlebar-tools[\s\S]*titleBarToolsHost/);
assert.match(app, /galaxyProductSpatialPresentation && titleBarToolsHost/);
assert.match(app, /galaxyLayoutClassic \? <div className="galaxy-hud">/);
assert.match(app, /galaxyLayoutClassic \? <div className="galaxy-legend"/);
assert.match(app, /galaxy-titlebar-filter-popover/);
assert.match(app, /data-open=\{galaxyLayoutClassic \|\| galaxyToolbarPopover === "filters"/);

assert.match(app, /className="sidera-edge-navigation-hotzone"/);
assert.match(app, /}, 150\);/);
assert.match(app, /event\.altKey && event\.key\.toLowerCase\(\) === "n"/);
assert.match(app, /onPointerEnter=\{armEdgeNavigation\}/);
assert.match(app, /onPointerLeave=\{cancelEdgeNavigationArm\}/);
assert.match(app, /edgeNavigationCloseTimerRef/);
assert.match(app, /scheduleNavigationAutoClose[\s\S]*?}, 220\);/);
assert.match(app, /onPointerEnter=\{cancelNavigationAutoClose\}/);
assert.match(app, /onPointerLeave=\{scheduleNavigationAutoClose\}/);
assert.match(css, /\.sidera-edge-navigation-hotzone\s*\{[\s\S]{0,220}width:\s*8px/);
assert.match(css, /\.agent-navigation-scrim\s*\{[\s\S]{0,180}background:\s*transparent/);

assert.match(app, /type GalaxyContextRailState\s*=[\s\S]*mode: "closed"[\s\S]*mode: "hotspot"; hotspotId: string[\s\S]*mode: "paper-summary"; hotspotId: string; paperId: string[\s\S]*mode: "paper-reading"; hotspotId: string; paperId: string/);
assert.match(app, /useState<GalaxyContextRailState>\(\{ mode: "closed" \}\)/);
assert.doesNotMatch(app, /setGalaxyContextRailMode/);
assert.match(app, /galaxyContextRailMode === "paper-reading" && selectedGalaxyPaperId/);
assert.match(css, /\.galaxy-inspector > :not\(\.galaxy-context-rail-close\)/);
assert.match(css, /\.galaxy-inspector > \.galaxy-context-rail-close\s*\{[\s\S]{0,120}position:\s*absolute/);
assert.match(css, /\.galaxy-layout-immersive \.galaxy-inspector\s*\{[\s\S]{0,180}top:\s*calc\(var\(--sidera-titlebar-height\) \+ 8px\)/);

assert.doesNotMatch(
  app,
  /useEffect\(\(\) => \{[\s\S]{0,260}kind:\s*"fit"[\s\S]{0,160}\},\s*\[[^\]]*visualMode/,
  "display/theory mode switching must not enqueue an automatic fit",
);
assert.match(canvas, /persistentRenderCoreRef/);
assert.match(canvas, /viewportOffsetRatio\?: number/);

console.log(JSON.stringify({
  audit: "sidera-galaxy-spatial-ui-r3",
  status: "PASS",
  productPersistentLeftHudCount: 0,
  titlebarToolHost: true,
  edgeNavigation: { widthPx: 8, dwellMs: 150, autoCloseDelayMs: 220, keyboard: "Alt+N" },
  contextRailStateOwnerCount: 1,
  legacyContextRailSetterCount: 0,
  automaticFitOnModeSwitch: 0,
}, null, 2));
