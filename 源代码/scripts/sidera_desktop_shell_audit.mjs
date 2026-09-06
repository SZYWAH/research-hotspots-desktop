import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const appSource = read("src/App.tsx");
const agentSource = read("src/components/AgentDualBackgroundPage.tsx");
const immersiveSource = read("src/components/AgentImmersiveStarfieldCanvas.tsx");
const theorySource = read("src/components/AgentTheoryBackgroundCanvas.tsx");
const galaxyCanvasSource = read("src/components/App17GalaxyCanvas.tsx");
const splashSource = read("src/components/SideraSplash.tsx");
const titleBarSource = read("src/components/SideraTitleBar.tsx");
const htmlSource = read("index.html");
const cssSource = `${read("src/index.css")}\n${read("src/components/AgentDualBackgroundPage.css")}`;
const tauriConfig = JSON.parse(read("src-tauri/tauri.conf.json"));
const capability = JSON.parse(read("src-tauri/capabilities/default.json"));

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: Boolean(condition), detail });
}

check(
  "normal cold start selects Agent",
  /galaxyVisualReview\s*\?\s*"galaxy"\s*:\s*"agent"/.test(appSource),
  "Galaxy review remains the only route override in the default activeView initializer.",
);
check(
  "boot state machine is explicit",
  ["booting-data", "mounting-agent", "ready", "failed"].every((phase) => splashSource.includes(`"${phase}"`)),
  "All required Sidera boot phases exist.",
);
check(
  "splash waits for real Agent readiness",
  appSource.includes("onInitialReady={handleAgentInitialReady}")
    && agentSource.includes("reportInitialReady")
    && agentSource.includes("onReady={revealRenderer}"),
  "The splash completion signal comes from the mounted background onReady path.",
);
check(
  "Agent startup requires a real dynamic first frame",
  !appSource.includes("SIDERA_AGENT_BACKGROUND_READY_TIMEOUT_MS")
    && !appSource.includes("动态星图初始化超时，已使用静态背景进入应用。")
    && agentSource.includes("await delay(0)")
    && !agentSource.includes("await nextAnimationFrame()")
    && immersiveSource.includes("renderSceneAndReportReady(performance.now())")
    && immersiveSource.includes("renderer.render(scene, camera)")
    && theorySource.includes("onFirstFrame={() =>")
    && galaxyCanvasSource.includes("onFirstFrameRef.current?.()")
    && galaxyCanvasSource.includes("render(performance.now())"),
  "No timer may promote startup. Both dynamic renderers synchronously report their first error-free WebGL frame.",
);
check(
  "splash timing and recovery routes exist",
  appSource.includes("Math.max(0, 1000 - elapsed)")
    && appSource.includes("Math.max(0, 2000 - elapsed)")
    && splashSource.includes("使用静态背景继续")
    && splashSource.includes("打开设置")
    && splashSource.includes("重试"),
  "Minimum display, delayed status, retry, settings, and an explicit user-selected diagnostic fallback are present.",
);
check(
  "startup surface is black before React",
  htmlSource.includes("<title>Sidera</title>")
    && htmlSource.includes("background: #000")
    && cssSource.includes(".sidera-splash"),
  "index.html and the splash share a black root surface.",
);
check(
  "brand and quote are present",
  splashSource.includes("SIDERA")
    && splashSource.includes("仰观宇宙之大，俯察品类之盛。")
    && splashSource.includes("王羲之《兰亭集序》"),
  "The locked Sidera wordmark and source line are rendered.",
);
check(
  "splash feedback is outside brand flow",
  splashSource.includes('className="sidera-splash__feedback"')
    && /\.sidera-splash__feedback\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?top:\s*calc\(100% \+ 34px\);/m.test(cssSource)
    && !/\.sidera-splash__content\s*\{[^}]*?min-height:/m.test(cssSource),
  "Loading and failure feedback use an absolute layer below the unchanged brand-flow boundary.",
);
check(
  "splash feedback keeps live recovery semantics",
  splashSource.includes('aria-live="polite"')
    && splashSource.includes('className="sidera-splash__status"')
    && splashSource.includes('className="sidera-splash__failure"')
    && cssSource.includes("@keyframes sidera-status-in"),
  "Status and failure content retain live semantics and only animate their own opacity and offset.",
);
check(
  "title bar uses scoped native window operations",
  titleBarSource.includes("getCurrentWindow")
    && titleBarSource.includes(".minimize()")
    && titleBarSource.includes(".toggleMaximize()")
    && titleBarSource.includes(".close()")
    && titleBarSource.includes("isDesktopRuntime"),
  "Native window operations are guarded and browser layout remains inert.",
);
check(
  "maximize paths share a guarded geometry transition",
  titleBarSource.includes("const handleToggleMaximize = useCallback(async () =>")
    && titleBarSource.includes("onBeforeToggleMaximize")
    && titleBarSource.includes("onAfterToggleMaximize")
    && titleBarSource.includes("SIDERA_WINDOW_RESIZE_QUIET_MS = 120")
    && titleBarSource.includes("SIDERA_WINDOW_RESIZE_FALLBACK_MS = 900")
    && titleBarSource.includes("finally")
    && titleBarSource.includes("maximizeToggleActiveRef.current"),
  "The button and title-bar double click use one locked async handler with settle and finally recovery.",
);

const mainWindow = tauriConfig.app?.windows?.find((window) => window.label === "main");
check(
  "Tauri window is branded and maximized",
  tauriConfig.productName === "Sidera"
    && mainWindow?.title === "Sidera"
    && mainWindow?.maximized === true
    && mainWindow?.center === true
    && mainWindow?.fullscreen === false
    && mainWindow?.decorations === false,
  "The main window is centered fallback, maximized, decorated by the app, and not exclusive fullscreen.",
);
check(
  "application identity remains stable",
  tauriConfig.identifier === "com.local.research-hotspots-desktop",
  "The existing identifier and therefore the existing local data identity remain unchanged.",
);

const requiredPermissions = [
  "core:window:allow-start-dragging",
  "core:window:allow-minimize",
  "core:window:allow-toggle-maximize",
  "core:window:allow-close",
  "core:window:allow-is-maximized",
];
check(
  "minimum title-bar permissions are declared",
  requiredPermissions.every((permission) => capability.permissions.includes(permission)),
  "All five required window permissions are present.",
);
check(
  "Agent controls reserve the title-bar safe area",
  cssSource.includes("top: calc(var(--sidera-titlebar-height, 38px) + 10px)")
    && cssSource.includes(".workspace--workbench")
    && cssSource.includes(".sidera-titlebar--transparent"),
  "Agent controls and workbench surfaces use the shared transparent 38px title-bar contract.",
);
check(
  "Agent navigation shares the uninterrupted starfield surface",
  cssSource.includes(".agent-navigation-scrim")
    && /\.agent-navigation-scrim\s*\{[\s\S]*?background:\s*transparent;[\s\S]*?backdrop-filter:\s*none;/m.test(cssSource)
    && /\.agent-navigation-drawer\s*\{[\s\S]*?border-right:\s*0;[\s\S]*?background:\s*transparent;[\s\S]*?box-shadow:\s*none;/m.test(cssSource)
    && /\.sidera-titlebar--transparent\s*\{[\s\S]*?background:\s*transparent;/m.test(cssSource),
  "The Agent title bar, click-catcher, and navigation drawer do not split, blur, or dim the starfield.",
);

const failures = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
}
if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS sidera desktop shell audit (${checks.length} checks)`);
}
