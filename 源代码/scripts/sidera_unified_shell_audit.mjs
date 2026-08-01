import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync("src/App.tsx", "utf8");
const css = fs.readFileSync("src/index.css", "utf8");
const shell = fs.readFileSync("src/lib/sideraShell.ts", "utf8");
const titleBar = fs.readFileSync("src/components/SideraTitleBar.tsx", "utf8");

assert.match(shell, /type SideraShellScene[\s\S]*?"agent"[\s\S]*?"workbench"[\s\S]*?"research-galaxy"[\s\S]*?"pipeline-formation"/);
assert.match(app, /<SideraTitleBar[\s\S]*?variant="transparent"/);
assert.doesNotMatch(app, /activeView !== "agent"[\s\S]{0,120}<aside className="sidebar-surface">/);
assert.match(app, /agentNavigationOpen \? \([\s\S]*?agent-navigation-drawer/);
assert.doesNotMatch(app, /sidera-global-nav-trigger/);
assert.match(app, /data-navigation-open=\{agentNavigationOpen \? "true" : "false"\}/);
assert.match(app, /data-navigation-layout=\{navigationLayout\}/);
assert.doesNotMatch(titleBar, /className="sidera-titlebar__navigation"/);
assert.doesNotMatch(titleBar, /onOpenNavigation/);
assert.match(titleBar, /className="sidera-titlebar__tools"/);
assert.match(app, /className="sidera-edge-navigation-hotzone"/);
assert.match(app, /event\.altKey && event\.key\.toLowerCase\(\) === "n"/);
assert.match(css, /\.sidera-edge-navigation-hotzone[\s\S]*?width:\s*8px;/);
assert.match(css, /\.agent-navigation-scrim[\s\S]*?background:\s*transparent;[\s\S]*?backdrop-filter:\s*none;/);
assert.match(css, /\.agent-navigation-drawer \.nav-row-active[\s\S]*?border-left-color:\s*transparent;[\s\S]*?background:\s*transparent;/);
assert.doesNotMatch(css.match(/\.agent-navigation-drawer \.nav-row-active[\s\S]*?\}/)?.[0] ?? "", /112,\s*164,\s*255|color-cyan|160,\s*197,\s*250/);

console.log(JSON.stringify({
  audit: "sidera-unified-shell",
  status: "PASS",
  transparentTitleBar: true,
  globalOverlayNavigation: true,
  titleBarNavigationTrigger: false,
  edgeNavigationTrigger: true,
  keyboardNavigationTrigger: "Alt+N",
  permanentSidebar: false,
  blueNavigationEmphasis: false,
}, null, 2));
