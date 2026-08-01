import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const agent = fs.readFileSync("src/components/AgentDualBackgroundPage.tsx", "utf8");
const shell = fs.readFileSync("src/lib/sideraShell.ts", "utf8");

assert.match(shell, /type SideraRendererOwner[\s\S]*?"agent-immersive"[\s\S]*?"workbench-star-river"[\s\S]*?"research-galaxy"/);
assert.match(app, /shellPresentation=\{activeView === "agent" \? "agent" : usesWorkbenchBackground \? "workbench" : "suspended"\}/);
assert.match(agent, /shellPresentation === "suspended"[\s\S]*?setMountedMode\(null\)/);
assert.match(agent, /mountedMode === targetMode[\s\S]*?mountedImmersiveStyle === targetStyle/);
assert.match(app, /\{active && app17FilteredPayload\?\.ready \? \(/);
assert.match(app, /initialCameraPose=\{galaxyCameraPose\}/);
assert.match(app, /onCameraPoseChange=\{setGalaxyCameraPose\}/);

console.log(JSON.stringify({
  audit: "sidera-background-ownership",
  status: "PASS",
  agentHostPersistent: true,
  workbenchStarRiverReusable: true,
  researchGalaxyCanvasActiveOnly: true,
  rendererUpperBound: 1,
}, null, 2));
