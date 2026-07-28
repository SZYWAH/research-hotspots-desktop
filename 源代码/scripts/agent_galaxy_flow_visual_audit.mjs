import { readFile } from "node:fs/promises";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function extractFragmentShaders(source) {
  const shaders = [];
  const constantPattern = /const\s+[A-Za-z0-9_]*FRAGMENT[A-Za-z0-9_]*\s*=\s*(?:\/\*[\s\S]*?\*\/\s*)?`([\s\S]*?)`/gi;
  const inlinePattern = /fragmentShader\s*:\s*`([\s\S]*?)`/gi;
  for (const pattern of [constantPattern, inlinePattern]) {
    for (const match of source.matchAll(pattern)) shaders.push(match[1]);
  }
  return shaders;
}

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

const [
  canvas,
  review,
  reviewCss,
  reviewConfig,
  flow,
  contract,
  photosphere,
  focusField,
  main,
] = await Promise.all([
  read("src/components/AgentGalaxyFlowCanvas.tsx"),
  read("src/components/AgentGalaxyFlowReview.tsx"),
  read("src/components/AgentGalaxyFlowReview.css"),
  read("src/lib/agentGalaxyFlowReview.ts"),
  read("src/lib/gravitationalWeaveFlow.ts"),
  read("src/lib/agentGalaxyFlowContract.ts"),
  read("src/lib/agentGalaxyPhotosphere.ts"),
  read("src/lib/agentGalaxyFocusField.ts"),
  read("src/main.tsx"),
]);

const fragmentShaders = extractFragmentShaders(canvas);
const fragmentShaderText = [
  ...fragmentShaders,
  photosphere,
].join("\n");
const lowerCanvas = canvas.toLowerCase();
const lowerFragmentShaders = fragmentShaderText.toLowerCase();

const forbiddenPostProcessingTokens = [
  "three.additiveblending",
  "effectcomposer",
  "unrealbloompass",
  "bokehpass",
];
const forbiddenGroupTransformPatterns = [
  /\bscene\.(?:rotation|scale)\b/,
  /\b(?:semantic|paper|hotspot|environment|dust|root)Group\.(?:rotation|scale|position)\b/,
  /\.rotate(?:X|Y|Z)\s*\(/,
];

const checks = {
  independentRenderer: canvas.includes("new THREE.WebGLRenderer")
    && canvas.includes("new THREE.BufferGeometry")
    && canvas.includes("new THREE.Points")
    && !canvas.includes("App17GalaxyCanvas")
    && !canvas.includes("AgentGalaxyBackgroundCanvas"),
  isolatedReviewComponent: review.includes('from "./AgentGalaxyFlowCanvas"')
    && review.includes("loadAgentGalaxyBackgroundPayload")
    && review.includes("__AGENT_GALAXY_FLOW_REVIEW__")
    && review.includes('data-review-ready='),
  isolatedReviewRoute: reviewConfig.includes('"agent-flow"')
    && reviewConfig.includes('AGENT_GALAXY_FLOW_REVIEW_MODEL = "gravitational-weave"')
    && main.includes("isAgentGalaxyFlowReviewMode() ?")
    && main.includes("<AgentGalaxyFlowReview />"),
  legacyRoutesPreserved: main.includes("isAgentGalaxyBackgroundReviewMode")
    && main.includes("<AgentGalaxyBackgroundReview />")
    && main.includes("isAgentGalaxyOrbitPrototypeMode")
    && main.includes("<AgentGalaxyOrbitPrototype />"),
  unchangedDefaultEntry: main.includes('import App from "./App"')
    && main.includes("<App />")
    && !main.includes('import App from "./components/AgentGalaxyFlow'),
  activeTechnicalModel: contract.includes('"agent-galaxy-flow-contract-v2"')
    && contract.includes('AGENT_GALAXY_ACTIVE_TECHNICAL_FLOW_MODEL')
    && contract.includes('"gravitational-weave-tech-preview"')
    && flow.includes('GRAVITATIONAL_WEAVE_MODEL_ID')
    && flow.includes('"gravitational-weave-tech-preview"')
    && flow.includes("id: GRAVITATIONAL_WEAVE_MODEL_ID"),
  truthfulCapabilities: flow.includes("deterministicAnalyticMotion: true")
    && flow.includes("dynamicFocus: false")
    && flow.includes("offscreenLoopRequired: false")
    && flow.includes("visibleRespawnAllowed: false")
    && flow.includes("runtimeLaneReassignmentAllowed: false"),
  normalBlendingOnly: canvas.includes("THREE.NormalBlending")
    && forbiddenPostProcessingTokens.every((token) => !lowerCanvas.includes(token)),
  sharpFragmentShadersFound: fragmentShaders.length >= 1
    && photosphere.includes("AGENT_GALAXY_PHOTOSPHERE_CORE_FRAGMENT_SHADER")
    && photosphere.includes("AGENT_GALAXY_PHOTOSPHERE_SURFACE_FRAGMENT_SHADER"),
  pureBlackCanvas: canvas.includes("setClearColor(0x000000, 1)")
    && reviewCss.includes("--flow-bg: #000000"),
  derivativeAntialiasedSharpCores: fragmentShaderText.includes("fwidth(radius)")
    && fragmentShaderText.includes(
      "sqrt(max(0.0, 1.0 - radiusSquared))",
    )
    && !fragmentShaderText.includes("motionBlur"),
  noTimeDrivenFragmentOpacity: !/\buTime\b/.test(fragmentShaderText)
    && !lowerFragmentShaders.includes("timeopacity")
    && canvas.includes('data-semantic-time-opacity="false"'),
  noSemanticBlurPipeline: !lowerCanvas.includes("webglrendertarget")
    && !canvas.includes("uFocusDistance")
    && !canvas.includes("uFocusRange")
    && !lowerCanvas.includes("motionblur")
    && canvas.includes("bloomMode: \"none\"")
    && canvas.includes("depthOfField: false"),
  noWholeGroupTransform: !canvas.includes("new THREE.Group")
    && forbiddenGroupTransformPatterns.every((pattern) => !pattern.test(canvas))
    && canvas.includes('data-whole-group-transform="false"'),
  fixedCameraDefault: reviewConfig.includes('requestedCamera === "codrift" ? "codrift" : "static"')
    && canvas.includes("setInitialCameraPose")
    && canvas.includes('config.camera === "codrift"')
    && !canvas.includes("camera.rotation")
    && !canvas.includes("OrbitControls"),
  deterministicFixedTime: reviewConfig.includes('params.has("time")')
    && reviewConfig.includes("fixedTimeSeconds")
    && canvas.includes("config.fixedTimeSeconds"),
  boundedCoDrift: /codriftMaxUnits:\s*0\.6\b/.test(canvas)
    && /codriftPeriodSeconds:\s*(?:6[0-9]|[7-9][0-9]|[1-9][0-9]{2,})\b/.test(canvas),
  qualityBudgets: ["1920", "55", "800", "1600", "2560", "75", "1200", "2600"]
    .every((value) => canvas.includes(value)),
  stableVisibleIdentityBudget: canvas.includes("3840")
    || contract.includes("residentPaperProxies: 3840"),
  reducedMotion: review.includes("prefers-reduced-motion")
    && review.includes("reducedMotion={reducedMotion}")
    && canvas.includes("reducedMotion"),
  hiddenPagePause: canvas.includes('document.addEventListener("visibilitychange"')
    && canvas.includes("document.hidden"),
  noOffscreenCatchUp: canvas.includes("pagePaused")
    && canvas.includes("lastFrameAt = performance.now()")
    && canvas.includes("animationSeconds +="),
  dprIndependentOfQuality: canvas.includes("Math.min(window.devicePixelRatio || 1, 2)")
    && canvas.includes("renderer.setPixelRatio(pixelRatio())"),
  focusFieldIsLocalAndBounded:
    focusField.includes("AGENT_GALAXY_FOCUS_FIELD_MAX_WORLD_UNITS = 0.24")
    && focusField.includes("sampleAgentGalaxyFocusFieldOffset")
    && canvas.includes("AGENT_GALAXY_FOCUS_FIELD_GLSL_CHUNK"),
  parameterSurface: [
    "gravity",
    "shear",
    "twist",
    "speed",
    "calm",
    "quality",
    "camera",
    "time",
    "record",
    "hud",
    "starMaterial",
    "focusField",
    "focusCamera",
  ]
    .every((parameter) => reviewConfig.includes(`"${parameter}"`)),
  recordingBound: reviewConfig.includes("Math.min(requestedRecord, 60)"),
};

for (const [name, pass] of Object.entries(checks)) {
  assert(pass, `Agent galaxy gravitational weave visual invariant failed: ${name}`);
}

console.log(JSON.stringify({
  pass: true,
  scope: "m1.2a-technical-static",
  technicalAcceptance: "PASS",
  productVisualAcceptance: "UNVERIFIED",
  model: "gravitational-weave-tech-preview",
  checks,
  budgets: {
    balanced: {
      paperProxies: 1920,
      perceptibleHotspots: 55,
      environmentStars: 800,
      dust: 1600,
    },
    high: {
      paperProxies: 2560,
      perceptibleHotspots: 75,
      environmentStars: 1200,
      dust: 2600,
    },
  },
  legacyCandidates: {
    voyage: "FAIL",
    breath: "FAIL",
    signal: "FAIL",
  },
  fixedCameraPrimary: true,
  defaultHomepageChanged: false,
  browserDynamicReview: "UNVERIFIED",
}, null, 2));
