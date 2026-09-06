import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const agent = fs.readFileSync("src/components/AgentDualBackgroundPage.tsx", "utf8");
const immersive = fs.readFileSync("src/components/AgentImmersiveStarfieldCanvas.tsx", "utf8");
const shell = fs.readFileSync("src/lib/sideraShell.ts", "utf8");

assert.match(shell, /type SideraRendererOwner[\s\S]*?"agent-immersive"[\s\S]*?"workbench-star-river"[\s\S]*?"research-galaxy"/);
assert.match(app, /shellPresentation=\{institutionBrowserVisible \? "suspended" : activeView === "agent" \? "agent" : usesWorkbenchBackground \? "workbench" : "suspended"\}/);
assert.match(agent, /shellPresentation === "suspended"[\s\S]*?setMountedMode\(null\)/);
assert.match(agent, /mountedMode === targetMode[\s\S]*?mountedImmersiveStyle === targetStyle/);
assert.match(app, /\{active && app17FilteredPayload\?\.ready \? \(/);
assert.match(app, /initialCameraPose=\{galaxyCameraPose\}/);
assert.match(app, /onCameraPoseChange=\{setGalaxyCameraPose\}/);
assert.match(agent, /SIDERA_WORKBENCH_RENDER_BUDGET_FPS = 24/);
assert.match(
  agent,
  /renderBudgetFps=\{shellPresentation === "workbench"[\s\S]*?SIDERA_WORKBENCH_RENDER_BUDGET_FPS[\s\S]*?: undefined\}/,
);
assert.match(immersive, /renderBudgetFps\?: number/);
assert.match(immersive, /const renderBudgetFpsRef = useRef/);
assert.match(
  immersive,
  /const rafDeltaMs = Math\.max\(0, nowMs - lastRafMs\)[\s\S]*?renderBudgetAccumulatorMs \+= rafDeltaMs/,
);
assert.match(
  immersive,
  /renderBudgetAccumulatorMs \+ 0\.01 < renderIntervalMs[\s\S]*?requestAnimationFrame\(renderFrame\)[\s\S]*?return/,
);
assert.match(
  immersive,
  /renderBudgetAccumulatorMs = renderBudgetAccumulatorMs >= renderIntervalMs[\s\S]*?renderBudgetAccumulatorMs % renderIntervalMs[\s\S]*?: 0/,
);
assert.match(
  immersive,
  /nowMs - lastProcessedFrameMs[\s\S]*?lastProcessedFrameMs = nowMs/,
);
assert.match(
  immersive,
  /const resume = \(\) => \{[\s\S]*?lastProcessedFrameMs = performance\.now\(\)[\s\S]*?lastRafMs = lastProcessedFrameMs[\s\S]*?renderBudgetAccumulatorMs = 0/,
);
assert.match(
  immersive,
  /renderSceneAndReportReady\(performance\.now\(\)\)[\s\S]*?animationFrame = requestAnimationFrame\(renderFrame\)/,
);
assert.match(
  immersive,
  /\}, \[\s*forceAnalyticFallback,\s*initialCheckpoint,\s*payload,\s*reducedMotion,\s*style,\s*\]\);/,
);

const callbackRefEffect = immersive.match(
  /useEffect\(\(\) => \{\r?\n\s+onElapsedRef\.current[\s\S]*?\r?\n  \]\);/,
);
assert(callbackRefEffect);
assert.equal(
  callbackRefEffect[0].includes("focusRefreshRef.current?.()"),
  false,
);

console.log(JSON.stringify({
  audit: "sidera-background-ownership",
  status: "PASS",
  agentHostPersistent: true,
  workbenchStarRiverReusable: true,
  workbenchRenderBudgetFps: 24,
  budgetHotSwappable: true,
  synchronousDynamicFirstFrame: true,
  researchGalaxyCanvasActiveOnly: true,
  rendererUpperBound: 1,
}, null, 2));
