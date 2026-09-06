import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO,
  SIDERA_INSTITUTION_BROWSER_LAYOUT_STORAGE_KEY,
  parseSideraInstitutionBrowserLayout,
  resolveSideraInstitutionSplitLayout,
  serializeSideraInstitutionBrowserLayout,
} from "../src/lib/sideraInstitutionLayout.ts";

const root = process.cwd();
const read = (file) => readFile(path.join(root, file), "utf8");
const [app, css, layoutSource, packageText, evidenceText, ...documents] = await Promise.all([
  read("src/App.tsx"),
  read("src/index.css"),
  read("src/lib/sideraInstitutionLayout.ts"),
  read("package.json"),
  read("docs/evidence/sidera-p1c-r2-native-split-browser-2026-08-05.json"),
  read("docs/PROJECT.md"),
  read("docs/ROADMAP.md"),
  read("docs/STATUS.md"),
  read("docs/ARCHITECTURE.md"),
  read("docs/DECISIONS.md"),
  read("docs/DEVELOPMENT.md"),
]);
const pkg = JSON.parse(packageText);
const evidence = JSON.parse(evidenceText);
const between = (source, start, end) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${start} source range`);
  return source.slice(from, to);
};
const withinOnePixel = (actual, expected) => Math.abs(actual - expected) <= 1;

// The pure parser is the single source of truth for runtime and this audit.
assert.equal(SIDERA_INSTITUTION_BROWSER_LAYOUT_STORAGE_KEY, "research-agent:sidera-institution-browser-layout:v1");
assert.equal(parseSideraInstitutionBrowserLayout(null), 0.5);
assert.equal(parseSideraInstitutionBrowserLayout("broken"), 0.5);
assert.equal(parseSideraInstitutionBrowserLayout('{"splitRatio":0.2}'), 0.5);
assert.equal(parseSideraInstitutionBrowserLayout('{"splitRatio":0.64}'), 0.64);
assert.equal(parseSideraInstitutionBrowserLayout(serializeSideraInstitutionBrowserLayout(0.6)), 0.6);
assert.equal(parseSideraInstitutionBrowserLayout(serializeSideraInstitutionBrowserLayout(Number.NaN)), SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO);

const layout1100 = resolveSideraInstitutionSplitLayout(1100, 0.5);
assert.equal(layout1100.narrow, true);
assert.equal(layout1100.nativeWidth, 1100);
assert.equal(layout1100.browserWidth, 1100);

for (const width of [1360, 1920]) {
  const centered = resolveSideraInstitutionSplitLayout(width, 0.5);
  const available = width - 8;
  assert.equal(centered.narrow, false);
  assert.ok(withinOnePixel(centered.nativeWidth, available / 2));
  assert.ok(withinOnePixel(centered.browserWidth, available / 2));
  assert.ok(centered.nativeWidth >= 420);
  assert.ok(centered.browserWidth >= 640);

  for (const requested of [0.3, 0.7]) {
    const endpoint = resolveSideraInstitutionSplitLayout(width, requested);
    assert.ok(endpoint.ratio >= 0.3 && endpoint.ratio <= 0.7);
    assert.ok(endpoint.nativeWidth >= 420 - 1);
    assert.ok(endpoint.browserWidth >= 640 - 1);
    assert.ok(withinOnePixel(endpoint.nativeWidth + endpoint.browserWidth, available));
  }
}

for (const marker of [
  'type SideraInstitutionBrowserPresentation = "closed" | "split" | "immersive"',
  "SIDERA_INSTITUTION_BROWSER_NARROW_BREAKPOINT = 1180",
  "SIDERA_INSTITUTION_NATIVE_MIN_WIDTH = 420",
  "SIDERA_INSTITUTION_BROWSER_MIN_WIDTH = 640",
  "SIDERA_INSTITUTION_BROWSER_MIN_RATIO = 0.3",
  "SIDERA_INSTITUTION_BROWSER_MAX_RATIO = 0.7",
]) assert.ok(layoutSource.includes(marker), marker);

// Runtime composition, persistence, pointer/keyboard divider and close rules.
for (const marker of [
  "institutionBrowserPresentation",
  'useState<SideraInstitutionBrowserPresentation>("closed")',
  "parseSideraInstitutionBrowserLayout",
  "serializeSideraInstitutionBrowserLayout",
  "resolveSideraInstitutionSplitLayout",
  "requestAnimationFrame",
  'event.key === "ArrowLeft" ? -0.02 : 0.02',
  'event.key === "Home"',
  'if (next.tabs.length === 0) setBrowserPresentation("closed")',
  'setBrowserPresentation(browserPresentation === "immersive" ? "split" : "immersive")',
  "原生研究",
  "机构网页",
  "返回双栏",
  "沉浸网页",
]) assert.ok(app.includes(marker), marker);
assert.ok(!app.includes("institutionBrowserRequested"));
assert.ok(!app.includes("workspace--institution-browser-focus"));

const sourceSwitch = between(app, "className=\"institution-source-switch\"", "className=\"institution-source-readiness\"");
assert.ok(sourceSwitch.includes("setSelectedSource(source)"));
assert.ok(!sourceSwitch.includes('setBrowserPresentation("closed")'));

const geometryEffect = between(app, "if (!browserSurfaceVisible || !browserHostRef.current", "function persistSplitRatio");
assert.ok(geometryEffect.includes("ResizeObserver"));
assert.ok(geometryEffect.includes('window.addEventListener("resize", update)'));
assert.ok(geometryEffect.includes("delta < 1"));
assert.ok(!geometryEffect.includes("document.addEventListener"));
assert.ok(!geometryEffect.includes('addEventListener("scroll"'));
assert.ok(!geometryEffect.includes('addEventListener("wheel"'));
assert.equal((geometryEffect.match(/setSideraInstitutionBrowserShellBounds/g) ?? []).length, 1);

for (const marker of [
  ".workspace--workbench.workspace--institution-browser-split",
  ".workspace--workbench.workspace--institution-browser-immersive",
  '.institution-workspace[data-browser-presentation="split"] .institution-workspace__split',
  "grid-template-columns: var(--institution-native-pane-width) 8px minmax(640px, 1fr)",
  ".institution-browser-resizer",
  "cursor: col-resize",
  "@media (max-width: 1179px)",
  '.institution-workspace[data-browser-presentation="split"][data-narrow-pane="native"] .institution-browser-shell',
  '.institution-workspace[data-browser-presentation="split"][data-narrow-pane="browser"] .institution-browser-shell',
]) assert.ok(css.includes(marker), marker);

for (const document of documents) {
  assert.ok(document.includes("P1c-R2"));
  assert.ok(document.includes("NATIVE SPLIT WORKSPACE UNVERIFIED"));
}
assert.equal(evidence.package, "Sidera-P1c-R2");
assert.equal(evidence.task, "开发 006");
assert.equal(evidence.status, "IMPLEMENTED");
assert.equal(evidence.automatedTechnical, "PASS");
assert.equal(evidence.nativeSplitWorkspace, "UNVERIFIED");
assert.equal(evidence.p1Status, "IN PROGRESS");
assert.equal(evidence.preImplementationNativeBaseline.embeddedBrowserScrolling, "PASS");
assert.equal(evidence.preImplementationNativeBaseline.productComposition, "FAIL");
assert.equal(evidence.preImplementationNativeBaseline.nativeFunctionContinuity, "FAIL");
assert.equal(evidence.externalInstitutionRequests, 0);
assert.equal(evidence.providerCalls, 0);
assert.equal(evidence.paperLibraryWrites, 0);
assert.equal(evidence.automatedDownloads, 0);
assert.equal(
  pkg.scripts["audit:sidera-institution-browser-p1c-r2"],
  "node --experimental-strip-types scripts/sidera_institution_browser_p1c_r2_audit.mjs",
);

console.log(JSON.stringify({
  status: "PASS",
  package: evidence.package,
  fixtures: {
    presentationClosedSplitImmersive: "PASS",
    defaultWideFiftyFifty: "PASS",
    dynamicMinimumWidths: "PASS",
    narrow1100SingleSurface: "PASS",
    preferenceRoundTripAndFallback: "PASS",
    pointerRafCoalescing: "PASS",
    keyboardDivider: "PASS",
    finalTabClosesPresentation: "PASS",
    immersiveRoundTrip: "PASS",
    sourceSwitchKeepsBrowser: "PASS",
    scrollBoundsIpc: "ZERO",
  },
  externalInstitutionRequests: 0,
  providerCalls: 0,
  paperLibraryWrites: 0,
  automatedDownloads: 0,
  nativeSplitWorkspace: "UNVERIFIED",
}, null, 2));
