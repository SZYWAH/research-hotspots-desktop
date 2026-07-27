import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const [
  canvas,
  review,
  reviewCss,
  reviewLoader,
  main,
  viteConfig,
] = await Promise.all([
  readFile(new URL("../src/components/AgentGalaxyBackgroundCanvas.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/AgentGalaxyBackgroundReview.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/components/AgentGalaxyBackgroundReview.css", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/agentGalaxyBackgroundReview.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/main.tsx", import.meta.url), "utf8"),
  readFile(new URL("../vite.config.ts", import.meta.url), "utf8"),
]);

const checks = {
  independentRenderer: canvas.includes("new THREE.WebGLRenderer") && !canvas.includes("App17GalaxyCanvas"),
  batchedGeometry: canvas.includes("THREE.BufferGeometry") && canvas.includes("THREE.Points"),
  localShaderBloom: canvas.includes('bloomMode: "shader-local"') && canvas.includes("hotspotGlowMaterial"),
  shaderDepthFocus: canvas.includes("uFocusDistance") && canvas.includes("uFocusRange"),
  motionStates: ["idle", "input", "answer", "reading"].every((state) => canvas.includes(`${state}: {`)),
  smootherstepTransition: canvas.includes("/ 900") && canvas.includes("smootherstep"),
  deterministicTime: canvas.includes("fixedTimeSeconds") && reviewLoader.includes('params.get("time")'),
  reducedMotion: canvas.includes("reducedMotion") && review.includes("prefers-reduced-motion"),
  hiddenPagePause: canvas.includes('document.addEventListener("visibilitychange"') && canvas.includes("pagePaused"),
  qualityTiers: canvas.includes("6000") && canvas.includes("2500") && canvas.includes("PAPER_LIMITS"),
  adaptiveDowngrade: canvas.includes("lowPerformanceWindows >= 2") && !canvas.includes("applyAdaptiveQuality(\"high\""),
  gpuDefaults: canvas.includes("nvidia|geforce|radeon") && canvas.includes('? "high" : "balanced"'),
  fallback: canvas.includes("WebGL unavailable") && reviewCss.includes("agent-galaxy-background__fallback"),
  reviewRoute: reviewLoader.includes('"agent-background"') && main.includes("isAgentGalaxyBackgroundReviewMode"),
  unchangedDefaultEntry: main.includes("<App />") && main.includes("<AgentGalaxyBackgroundReview />"),
  reviewPresets: ["voyage", "breath", "signal"].every((preset) => review.includes(`${preset}: {`)),
  recordingPath: review.includes("canvas.captureStream(30)") && review.includes("MediaRecorder"),
  recordingPersistence: review.includes("/__agent-background-recording")
    && review.includes('setRecordingState("saving")')
    && viteConfig.includes("AGENT_RECORDING_NAME")
    && viteConfig.includes("MIN_AGENT_RECORDING_BYTES")
    && viteConfig.includes("MAX_AGENT_RECORDING_BYTES")
    && review.includes("recording-invalid-webm-header")
    && viteConfig.includes("recording has an invalid WebM header")
    && viteConfig.includes('origin !== "http://127.0.0.1:5174"'),
  recordingStrictModeSafe: review.includes("let active = true")
    && review.includes("recording-blob-too-small")
    && review.includes("if (!active)"),
  readinessSnapshot: review.includes("__AGENT_GALAXY_BACKGROUND_REVIEW__") && review.includes("data-review-ready"),
  liveTimelineDefault: reviewLoader.includes('params.has("time")') && reviewLoader.includes('params.has("record")'),
  noCssGradient: !reviewCss.toLowerCase().includes("gradient("),
};

for (const [name, pass] of Object.entries(checks)) {
  assert(pass, `Agent galaxy visual invariant failed: ${name}`);
}

console.log(JSON.stringify({
  pass: true,
  scope: "legacy-infrastructure-only",
  productVisualAcceptance: "FAIL",
  candidateDecision: "rejected-retained-for-history",
  replacementAudit: "audit:agent-galaxy-flow-preparation",
  checks,
  presets: ["voyage", "breath", "signal"],
  motionStates: ["idle", "input", "answer", "reading"],
  qualityLevels: ["balanced", "high"],
  fixedTimeline: true,
  defaultHomepageChanged: false,
}, null, 2));
