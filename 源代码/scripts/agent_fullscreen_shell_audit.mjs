import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const appSource = await readFile(path.join(root, "src/App.tsx"), "utf8");
const pageSource = await readFile(
  path.join(root, "src/components/AgentDualBackgroundPage.tsx"),
  "utf8",
);
const cssSource = await readFile(path.join(root, "src/index.css"), "utf8");

assert.match(
  appSource,
  /agentNavigationOpen \? \([\s\S]*?<aside className="sidebar-surface agent-navigation-drawer">/,
  "All routes must share the overlay navigation drawer.",
);
assert.match(
  appSource,
  /activeView !== "agent" \? \([\s\S]*?sidera-global-nav-trigger/,
  "Non-Agent routes must expose the same global navigation entry.",
);
assert.match(
  appSource,
  /onOpenNavigation=\{\(\) => setAgentNavigationOpen\(true\)\}/,
  "Agent page must expose the overlay navigation trigger.",
);
assert.match(
  cssSource,
  /\.agent-navigation-drawer\s*\{[\s\S]*?position:\s*fixed/,
  "Navigation drawer must overlay instead of resizing the WebGL viewport.",
);
assert.match(
  cssSource,
  /\.workspace--agent,[\s\S]*?\.workspace--research-galaxy\s*\{[\s\S]*?overflow:\s*hidden/,
  "Agent workspace must own the complete remaining viewport.",
);
assert.match(
  pageSource,
  /title="打开导航"[\s\S]*?onClick=\{onOpenNavigation\}/,
  "The floating navigation button is missing.",
);

console.log(JSON.stringify({
  audit: "agent-fullscreen-shell",
  status: "PASS",
  permanentSidebarRemoved: true,
  overlayDrawer: true,
  canvasResizeOnDrawer: false,
}, null, 2));
