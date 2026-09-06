import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), "utf8");
const section = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  return from >= 0 && to > from ? source.slice(from, to) : "";
};

const agentSource = read("src/components/AgentDualBackgroundPage.tsx");
const agentCss = read("src/components/AgentDualBackgroundPage.css");
const appSource = read("src/App.tsx");
const switchSource = section(
  agentSource,
  "const switchBackground = async (",
  "const switchImmersiveStyle = async",
);
const preflightSource = section(
  switchSource,
  'if (mode === "theory" && !forceStaticBackground)',
  "setExploreTheory(false)",
);
const ensurePayloadSource = section(
  agentSource,
  "const ensurePayload = useCallback(async (mode: AgentBackgroundMode) =>",
  "const resolveMessageReferences = useCallback(async (",
);

const checks = [];
function check(name, condition, detail) {
  checks.push({ name, pass: Boolean(condition), detail });
}

check(
  "theory payload is checked before mode ownership changes",
  preflightSource.includes("const preflightToken = ++switchTokenRef.current")
    && preflightSource.includes('setTheoryAvailability({ state: "checking", message: "" })')
    && preflightSource.includes('await ensurePayload("theory")')
    && switchSource.indexOf('await ensurePayload("theory")')
      < switchSource.indexOf("setPreferredMode(mode)")
    && switchSource.indexOf('await ensurePayload("theory")')
      < switchSource.indexOf("window.localStorage.setItem(MODE_STORAGE_KEY, mode)"),
  "Manual theory selection must prove a ready payload before changing preferred mode, focus ownership, or persistence.",
);

check(
  "not-ready preflight keeps the immersive renderer mounted",
  preflightSource.includes("preflightToken !== switchTokenRef.current")
    && preflightSource.includes("error instanceof TheoryBackgroundNotReadyError")
    && preflightSource.includes('state: error instanceof TheoryBackgroundNotReadyError')
    && preflightSource.includes("setSwitching(false)")
    && !preflightSource.includes("setMountedMode(")
    && !preflightSource.includes("setMaskVisible(")
    && !preflightSource.includes("mountBackground("),
  "A missing current V20 snapshot is an availability result and cannot blank, mask, or remount the running immersive Canvas.",
);

check(
  "stale project payload cannot populate the active cache",
  agentSource.includes("type AgentPayloadProjectIdentity = Readonly<{")
    && agentSource.includes("useLayoutEffect(() => {\n    if (payloadProjectIdentityRef.current.projectKey === projectKey) return;")
    && agentSource.includes("generation: payloadProjectIdentityRef.current.generation + 1")
    && ensurePayloadSource.includes("const requestedIdentity = payloadProjectIdentityRef.current")
    && ensurePayloadSource.includes("payloadProjectIdentityRef.current !== requestedIdentity")
    && ensurePayloadSource.indexOf("assertCurrentIdentity();")
      < ensurePayloadSource.indexOf("theoryPayloadRef.current = payload")
    && ensurePayloadSource.includes("theoryPayloadIdentityRef.current === requestedIdentity")
    && preflightSource.includes("error instanceof AgentBackgroundPayloadStaleError"),
  "Payload caches are bound to database-directory plus project identity and generation; an A-B-A project transition cannot accept an older IPC response.",
);

check(
  "availability and renderer failures remain distinct",
  agentSource.includes("export type TheoryAvailabilityState =")
    && ["idle", "checking", "not-ready", "failed"].every((state) => (
      agentSource.includes(`| "${state}"`) || agentSource.includes(`= "${state}"`)
    ))
    && agentSource.includes('stage: "payload" | "renderer"')
    && agentSource.includes("理论星图待更新")
    && agentSource.includes("理论载荷读取失败")
    && agentSource.includes("背景载荷读取失败")
    && agentSource.includes("背景渲染失败"),
  "Expected data absence, IPC or payload failure, and actual WebGL runtime failure have separate user-facing states.",
);

check(
  "theory availability dialog has bounded actions and focus recovery",
  agentSource.includes('role="dialog"')
    && agentSource.includes('aria-modal="false"')
    && agentSource.includes("继续沉浸")
    && agentSource.includes("前往分析流水线")
    && agentSource.includes("theoryAvailabilityContinueRef.current?.focus()")
    && agentSource.includes("theoryAvailabilityTriggerRef.current?.focus()")
    && agentSource.includes("if (theoryAvailabilityVisible)")
    && agentSource.includes("dismissTheoryAvailability();"),
  "Continue and Escape dismiss the non-modal panel and return focus to the initiating control; pipeline navigation stays explicit.",
);

check(
  "both theory entry points use the same preflight",
  agentSource.includes('preferredMode === "immersive" ? "theory" : "immersive",\n            event.currentTarget')
    && agentSource.includes('switchBackground("theory", event.currentTarget)'),
  "The top-level mode control and evidence-card semantic-position action share one theory switch authority.",
);

check(
  "analysis pipeline navigation is narrow and explicit",
  agentSource.includes("onOpenPipeline?: () => void")
    && appSource.includes('onOpenPipeline={() => setActiveView("pipeline")}')
    && !preflightSource.includes("onOpenPipeline"),
  "The availability panel can navigate to the existing pipeline view but preflight never starts modelling itself.",
);

check(
  "historical provenance moved into the More menu",
  agentSource.includes("agent-dual-page__source-summary")
    && agentSource.includes("非当前热点分析")
    && agentSource.includes("dynamicFallbackNotice")
    && agentSource.includes("data-visual-source-kind")
    && agentSource.includes("data-source-library-revision")
    && !agentSource.includes("agent-dual-page__visual-source-status")
    && !agentCss.includes("agent-dual-page__visual-source-status"),
  "Source revision, paper counts, freshness, and cold fallback truth remain available on demand without a persistent upper-left banner.",
);

check(
  "source menu and availability panel retain the black Sidera surface",
  agentCss.includes("width: min(260px, calc(100vw - 32px))")
    && agentCss.includes(".agent-dual-page__source-summary")
    && agentCss.includes(".agent-dual-page__availability")
    && (agentCss.match(/background: rgba\(0, 0, 0, 0\.94\)/g) ?? []).length >= 2,
  "The on-demand provenance block fits a compact menu and the availability surface does not introduce a blue-gray panel.",
);

check(
  "cold-start dynamic fallback contract remains intact",
  agentSource.includes("!initialReadyReportedRef.current")
    && agentSource.includes('await ensurePayload("immersive")')
    && agentSource.includes('setMountedMode("immersive")')
    && !agentSource.includes('setMountedMode("static")'),
  "Manual availability UX cannot weaken the existing real-dynamic-first-frame startup path.",
);

const failures = checks.filter((item) => !item.pass);
for (const item of checks) {
  console.log(`${item.pass ? "PASS" : "FAIL"} ${item.name}: ${item.detail}`);
}
if (failures.length > 0) {
  process.exitCode = 1;
} else {
  console.log(`PASS Sidera Agent theory availability R1 audit (${checks.length} checks)`);
}
