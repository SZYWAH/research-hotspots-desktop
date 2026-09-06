import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const css = `${fs.readFileSync("src/index.css", "utf8")}\n${fs.readFileSync("src/components/AgentDualBackgroundPage.css", "utf8")}`;
const shell = fs.readFileSync("src/lib/sideraShell.ts", "utf8");

assert.match(shell, /style:\s*"star-river"[\s\S]*?brightness:\s*0\.34[\s\S]*?speedScale:\s*0\.2[\s\S]*?interactive:\s*false/);
assert.match(app, /shellPresentation=\{institutionBrowserVisible \? "suspended" : activeView === "agent" \? "agent" : usesWorkbenchBackground \? "workbench" : "suspended"\}/);
assert.match(css, /\.agent-dual-page--shell-workbench \.agent-dual-page__background[\s\S]*?opacity:\s*0\.34/);
assert.match(css, /\.workspace--workbench > \.page-grid,[\s\S]*?border-radius:\s*18px;[\s\S]*?background:\s*rgba\(0, 0, 0, 0\.94\);[\s\S]*?box-shadow:\s*none;/);
assert.match(css, /data-navigation-layout="workbench-reserve"[\s\S]*?data-navigation-open="true"[\s\S]*?padding-left:\s*calc\(var\(--sidera-navigation-width\) \+ var\(--sidera-workbench-navigation-gap\)\)/);

console.log(JSON.stringify({
  audit: "sidera-workbench-surfaces",
  status: "PASS",
  backgroundStyle: "star-river",
  brightness: 0.34,
  speedScale: 0.2,
  unifiedSurface: true,
  navigationReserve: true,
}, null, 2));
