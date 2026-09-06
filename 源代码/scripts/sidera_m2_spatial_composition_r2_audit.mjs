import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import * as THREE from "three";

import { resolveSideraFocusComposition } from "../src/lib/sideraFocus.ts";
import {
  App17PaperJourneyController,
  projectGalaxyPaperTargetToNdc,
  resolveGalaxyPaperReadingPose,
} from "../src/components/App17PaperJourneyController.ts";
import {
  resolveGalaxyOverviewCameraPose,
  resolveResearchGalaxyContextComposition,
} from "../src/components/App17GalaxySpatialComposition.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relative) => readFile(path.join(root, relative), "utf8");

const focusCases = [
  { viewport: [1100, 760], dialog: [270, 90, 830, 670] },
  { viewport: [1440, 900], dialog: [340, 120, 1100, 780] },
  { viewport: [1920, 1080], dialog: [580, 170, 1340, 900] },
];

for (const { viewport: [viewportWidth, viewportHeight], dialog: [left, top, right, bottom] } of focusCases) {
  const composition = resolveSideraFocusComposition({
    viewportWidth,
    viewportHeight,
    titlebarHeight: 38,
    dialogBounds: {
      left,
      top,
      right,
      bottom,
      width: right - left,
      height: bottom - top,
    },
    fallbackSide: "left",
  });
  assert.ok(composition.targetDiameterPx >= 160 && composition.targetDiameterPx <= 240);
  assert.ok(composition.dialogGapPx >= 40 && composition.dialogGapPx <= 64);
  const radius = composition.targetDiameterPx / 2;
  const targetEdge = composition.side === "left"
    ? composition.targetCenterPx[0] + radius
    : composition.targetCenterPx[0] - radius;
  const measuredGap = composition.side === "left" ? left - targetEdge : targetEdge - right;
  assert.ok(Math.abs(measuredGap - composition.dialogGapPx) <= 0.01, `focus gap drifted by ${measuredGap - composition.dialogGapPx}px`);
  assert.ok(composition.targetCenterPx[0] - radius >= 24 - 0.01);
  assert.ok(composition.targetCenterPx[0] + radius <= viewportWidth - 24 + 0.01);
}

const [canvasSource, appSource, dialogCss, globalCss] = await Promise.all([
  read("src/components/App17GalaxyCanvas.tsx"),
  read("src/App.tsx"),
  read("src/components/AgentDualBackgroundPage.css"),
  read("src/index.css"),
]);

assert.ok(!appSource.includes("viewportOffsetRatio={galaxyInspectorOpen ? 0.08 : 0}"));
assert.ok(appSource.includes("contextRailMode={galaxyContextRailMode"));
assert.ok(canvasSource.includes('visualProfile === "analysis"'));
assert.ok(canvasSource.includes('resolveResearchGalaxyContextComposition(mode, width).viewportOffsetRatio'));
assert.ok(canvasSource.includes('paperRailAnchorNdcX("paper-reading")'));
assert.ok(canvasSource.includes("resolveGalaxyOverviewCameraPose({"));
assert.ok(!canvasSource.includes("cameraPreset.center.copy(restoredCenter)"));
assert.match(
  canvasSource,
  /onCameraPoseChangeRef\.current\s*&& exploration\.state === "overview"\s*&& paperJourney\.getState\(\) === "idle"/u,
  "transient hotspot and paper pivots must not overwrite the persisted overview pose",
);
assert.match(
  canvasSource,
  /const publishCameraPose = \(\) => \{\s*if \(exploration\.state !== "overview" \|\| paperJourney\.getState\(\) !== "idle"\) return;/u,
  "cleanup and Fast Refresh camera publication must reject transient system pivots",
);
assert.ok(canvasSource.includes('viewportOffsetTransition.phase === "focusing-paper"'));
assert.ok(canvasSource.includes('? paperJourneyFrame.focusBlend'));
assert.ok(canvasSource.includes('viewportOffsetTransition.phase === "returning-system"'));
assert.ok(canvasSource.includes('? 1 - paperJourneyFrame.focusBlend'));
assert.ok(canvasSource.includes('return 0;'));
assert.ok(canvasSource.includes('acquireDurationMs: visualProfile === "agent-theory" ? undefined : 0'));
assert.ok(canvasSource.includes("projectGalaxyPaperTargetToNdc("));
assert.match(
  canvasSource,
  /const exploration: GalaxyExplorationRuntime = \{[\s\S]*?state: "overview"[\s\S]*?onExplorationStateChangeRef\.current\?\.\("overview"\);/u,
  "a rebuilt canvas runtime must publish its fresh overview state to the parent shell",
);
assert.match(
  canvasSource,
  /const beginExitSystem = \(now: number\) => \{\s*if \(exploration\.state === "overview"\) return;/u,
  "the runtime-state synchronization must cover the existing overview exit no-op guard",
);

assert.match(globalCss, /data-mode="hotspot"[\s\S]*?clamp\(360px, 20vw, 400px\)/u);
assert.match(globalCss, /data-mode="paper-summary"[\s\S]*?clamp\(420px, 24vw, 480px\)/u);
assert.match(globalCss, /data-mode="paper-reading"[\s\S]*?clamp\(500px, 29vw, 580px\)/u);
assert.match(globalCss, /max-width: 899px[\s\S]*?min\(440px, calc\(100vw - 32px\)\)/u);

const researchViewportWidths = [1100, 1360, 1440, 1920];
const researchRailModes = ["closed", "hotspot", "paper-summary", "paper-reading"];
for (const viewportWidth of researchViewportWidths) {
  for (const railMode of researchRailModes) {
    const composition = resolveResearchGalaxyContextComposition(railMode, viewportWidth);
    assert.equal(
      composition.viewportOffsetRatio,
      0,
      `${railMode} shifted the ${viewportWidth}px research-galaxy viewport`,
    );
    const galaxyCenterPx = viewportWidth * (0.5 - composition.viewportOffsetRatio);
    assert.ok(
      Math.abs(galaxyCenterPx - viewportWidth / 2) <= 1,
      `${railMode} moved the galaxy center by ${galaxyCenterPx - viewportWidth / 2}px`,
    );
    if (railMode === "paper-summary" || railMode === "paper-reading") {
      const expectedAnchorNdcX = -(composition.railWidthPx + 24) / viewportWidth;
      assert.ok(Math.abs(composition.paperAnchorNdcX - expectedAnchorNdcX) <= 1e-12);
      const paperCenterPx = (composition.paperAnchorNdcX * 0.5 + 0.5) * viewportWidth;
      assert.ok(
        Math.abs(paperCenterPx - composition.effectiveViewportWidthPx / 2) <= 1e-9,
        `${railMode} paper anchor left the effective viewport center by ${paperCenterPx - composition.effectiveViewportWidthPx / 2}px`,
      );
    } else {
      assert.equal(composition.paperAnchorNdcX, 0);
    }
  }
}

const canonicalOverviewPose = {
  center: [0, 0, -0.1],
  distance: Math.hypot(8.9, 3.6),
  azimuth: Math.PI / 4,
  elevation: Math.atan2(3.6, 8.9),
};
const validOverviewPose = resolveGalaxyOverviewCameraPose({
  mode: "nebula",
  canonicalPose: canonicalOverviewPose,
  restoredPose: {
    center: [0, 0, -0.1],
    distance: 8.4,
    azimuth: 0.92,
    elevation: 0.31,
  },
  minimumDistance: 1.9,
  maximumDistance: 15.2,
  minimumElevation: THREE.MathUtils.degToRad(-80),
  maximumElevation: THREE.MathUtils.degToRad(88),
});
assert.equal(validOverviewPose.restoration, "overview-pose");
assert.deepEqual(validOverviewPose.center, canonicalOverviewPose.center);
assert.equal(validOverviewPose.distance, 8.4);
assert.equal(validOverviewPose.azimuth, 0.92);

const rejectedHotspotPose = resolveGalaxyOverviewCameraPose({
  mode: "nebula",
  canonicalPose: canonicalOverviewPose,
  restoredPose: {
    center: [2.4, -1.2, 0.5],
    distance: 2.2,
    azimuth: -0.4,
    elevation: 0.1,
  },
  minimumDistance: 1.9,
  maximumDistance: 15.2,
  minimumElevation: THREE.MathUtils.degToRad(-80),
  maximumElevation: THREE.MathUtils.degToRad(88),
});
assert.equal(rejectedHotspotPose.restoration, "canonical-default-transient-center");
assert.deepEqual(rejectedHotspotPose.center, canonicalOverviewPose.center);
assert.equal(rejectedHotspotPose.distance, canonicalOverviewPose.distance);
assert.equal(rejectedHotspotPose.azimuth, canonicalOverviewPose.azimuth);

const pivotCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 240);
pivotCamera.up.set(0, 0, 1);
const pivotCenter = new THREE.Vector3(...rejectedHotspotPose.center);
let maximumPivotProjectionError = 0;
for (const azimuth of [0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2]) {
  const horizontalDistance = rejectedHotspotPose.distance * Math.cos(rejectedHotspotPose.elevation);
  pivotCamera.position.set(
    pivotCenter.x + horizontalDistance * Math.cos(azimuth),
    pivotCenter.y + horizontalDistance * Math.sin(azimuth),
    pivotCenter.z + rejectedHotspotPose.distance * Math.sin(rejectedHotspotPose.elevation),
  );
  pivotCamera.lookAt(pivotCenter);
  pivotCamera.updateMatrixWorld(true);
  const projectedPivot = pivotCenter.clone().project(pivotCamera);
  maximumPivotProjectionError = Math.max(
    maximumPivotProjectionError,
    Math.hypot(projectedPivot.x, projectedPivot.y),
  );
  assert.ok(Math.abs(pivotCamera.position.distanceTo(pivotCenter) - rejectedHotspotPose.distance) <= 1e-9);
}
assert.ok(maximumPivotProjectionError <= 1e-12);

assert.match(dialogCss, /\.agent-dual-dialog__composer-track\s*\{[\s\S]*?align-items: center;[\s\S]*?min-height: 42px;[\s\S]*?max-height: 100px;[\s\S]*?padding: 6px 0;/u);
assert.match(dialogCss, /\.agent-dual-dialog__composer-track > button\s*\{[\s\S]*?width: 30px;[\s\S]*?height: 30px;[\s\S]*?align-self: center;/u);
assert.match(dialogCss, /\.agent-dual-dialog__composer-track textarea\s*\{[\s\S]*?height: 20px;[\s\S]*?min-height: 20px;[\s\S]*?max-height: 88px;[\s\S]*?padding: 0;[\s\S]*?line-height: 20px;/u);

const journeyViewport = { width: 1920, height: 1080 };
const journeyCamera = new THREE.PerspectiveCamera(
  50,
  journeyViewport.width / journeyViewport.height,
  0.1,
  240,
);
journeyCamera.up.set(0, 0, 1);
journeyCamera.position.set(8, -11, 6);
const journeyTarget = new THREE.Vector3(0.7, 0.4, -0.2);
journeyCamera.lookAt(journeyTarget);
journeyCamera.updateMatrixWorld(true);
const paperSummaryRailWidth = journeyViewport.width * 0.24;
const paperSummaryOffsetPx = Math.round((paperSummaryRailWidth + 24) / 2);
journeyCamera.setViewOffset(
  journeyViewport.width,
  journeyViewport.height,
  paperSummaryOffsetPx,
  0,
  journeyViewport.width,
  journeyViewport.height,
);
journeyCamera.updateProjectionMatrix();

const journeyStartPose = {
  position: journeyCamera.position.clone(),
  quaternion: journeyCamera.quaternion.clone(),
};
const journeyProjection = {
  fovDegrees: journeyCamera.fov,
  aspect: journeyCamera.aspect,
  zoom: journeyCamera.zoom,
  up: journeyCamera.up.clone(),
};
const shiftedStartAnchor = journeyTarget.clone().project(journeyCamera);
const canonicalStartAnchor = projectGalaxyPaperTargetToNdc(
  journeyTarget,
  journeyStartPose,
  journeyProjection,
);
assert.ok(
  Math.abs(shiftedStartAnchor.x - canonicalStartAnchor.x) > 0.2,
  "the regression fixture must include a material context-rail view offset",
);

const researchReadingComposition = resolveResearchGalaxyContextComposition(
  "paper-reading",
  journeyViewport.width,
);
const resolvedJourneyPose = resolveGalaxyPaperReadingPose({
  startCameraPose: journeyStartPose,
  targetWorldPosition: journeyTarget,
  targetDistance: 4,
  startAnchorNdcX: canonicalStartAnchor.x,
  startAnchorNdcY: canonicalStartAnchor.y,
  endAnchorNdcX: researchReadingComposition.paperAnchorNdcX,
  endAnchorNdcY: 0,
  projection: journeyProjection,
  viewportWidth: journeyViewport.width,
  viewportHeight: journeyViewport.height,
  starCenter: new THREE.Vector3(100, 100, 100),
  starSafeRadius: 1,
});
assert.ok(resolvedJourneyPose, "the canonical direct paper path must resolve");

const journey = new App17PaperJourneyController();
let journeyFrame = journey.startFocus({
  now: 0,
  targetId: "projection-continuity-paper",
  targetWorldPosition: journeyTarget,
  startPose: journeyStartPose,
  systemPose: journeyStartPose,
  endCameraPose: resolvedJourneyPose.endCameraPose,
  preparedPath: resolvedJourneyPose.path,
  startAnchorNdcX: canonicalStartAnchor.x,
  startAnchorNdcY: canonicalStartAnchor.y,
  targetAnchorNdcX: researchReadingComposition.paperAnchorNdcX,
  targetAnchorNdcY: 0,
  durationMs: 1_800,
  acquireDurationMs: 0,
  projection: journeyProjection,
  starCenter: new THREE.Vector3(100, 100, 100),
  starSafeRadius: 1,
  targetWorldDiameter: 0.1,
  viewportWidth: journeyViewport.width,
  viewportHeight: journeyViewport.height,
});
assert.ok(journeyFrame.cameraPose);
const focusStartPositionError = journeyFrame.cameraPose.position.distanceTo(
  journeyStartPose.position,
);
const focusStartAngleErrorDegrees = THREE.MathUtils.radToDeg(
  journeyFrame.cameraPose.quaternion.angleTo(journeyStartPose.quaternion),
);
assert.ok(focusStartPositionError <= 1e-9, `focus start position jumped by ${focusStartPositionError}`);
assert.ok(focusStartAngleErrorDegrees <= 1e-6, `focus start angle jumped by ${focusStartAngleErrorDegrees} degrees`);

let journeyNow = 0;
for (let index = 0; index < 120 && journeyFrame.state !== "reading"; index += 1) {
  journeyNow += 40;
  journeyFrame = journey.advance(journeyNow);
}
assert.equal(journeyFrame.state, "reading");
assert.ok(journeyFrame.cameraPose);
const readingAnchor = projectGalaxyPaperTargetToNdc(
  journeyTarget,
  journeyFrame.cameraPose,
  journeyProjection,
);
assert.ok(
  Math.abs(readingAnchor.x - researchReadingComposition.paperAnchorNdcX) <= 1e-6,
  `paper reading anchor drifted by ${readingAnchor.x - researchReadingComposition.paperAnchorNdcX} NDC`,
);
const researchSummaryComposition = resolveResearchGalaxyContextComposition(
  "paper-summary",
  journeyViewport.width,
);
journey.setReadingAnchor(researchSummaryComposition.paperAnchorNdcX, journeyNow);
for (let index = 0; index < 20 && journey.isMoving(); index += 1) {
  journeyNow += 40;
  journeyFrame = journey.advance(journeyNow);
}
const summaryAnchor = projectGalaxyPaperTargetToNdc(
  journeyTarget,
  journeyFrame.cameraPose,
  journeyProjection,
);
assert.ok(
  Math.abs(summaryAnchor.x - researchSummaryComposition.paperAnchorNdcX) <= 1e-6,
  `paper summary anchor drifted by ${summaryAnchor.x - researchSummaryComposition.paperAnchorNdcX} NDC`,
);
journey.setReadingAnchor(researchReadingComposition.paperAnchorNdcX, journeyNow);
for (let index = 0; index < 20 && journey.isMoving(); index += 1) {
  journeyNow += 40;
  journeyFrame = journey.advance(journeyNow);
}
const restoredReadingAnchor = projectGalaxyPaperTargetToNdc(
  journeyTarget,
  journeyFrame.cameraPose,
  journeyProjection,
);
assert.ok(
  Math.abs(restoredReadingAnchor.x - researchReadingComposition.paperAnchorNdcX) <= 1e-6,
  `restored paper reading anchor drifted by ${restoredReadingAnchor.x - researchReadingComposition.paperAnchorNdcX} NDC`,
);
journeyNow += 40;
journeyFrame = journey.startReturn({
  now: journeyNow,
  currentPose: journeyFrame.cameraPose,
  projection: journeyProjection,
  durationMs: 1_800,
});
for (let index = 0; index < 120 && journeyFrame.state === "flying-out"; index += 1) {
  journeyNow += 40;
  journeyFrame = journey.advance(journeyNow);
}
assert.equal(journeyFrame.state, "releasing");
assert.ok(journeyFrame.cameraPose);
const returnEndPositionError = journeyFrame.cameraPose.position.distanceTo(
  journeyStartPose.position,
);
const returnEndAngleErrorDegrees = THREE.MathUtils.radToDeg(
  journeyFrame.cameraPose.quaternion.angleTo(journeyStartPose.quaternion),
);
assert.ok(returnEndPositionError <= 1e-8, `return endpoint position drifted by ${returnEndPositionError}`);
assert.ok(returnEndAngleErrorDegrees <= 1e-5, `return endpoint angle drifted by ${returnEndAngleErrorDegrees} degrees`);
const returnSystemCenter = projectGalaxyPaperTargetToNdc(
  journeyTarget,
  journeyFrame.cameraPose,
  journeyProjection,
);
assert.ok(
  Math.abs(returnSystemCenter.x - canonicalStartAnchor.x) * journeyViewport.width * 0.5 <= 1,
  "return endpoint did not restore the physical canvas center",
);

console.log(JSON.stringify({
  status: "PASS",
  workPackage: "M2.0b-R2",
  focusCases: focusCases.length,
  researchViewportWidths,
  railModes: ["hotspot", "paper-summary", "paper-reading"],
  cameraWriter: "paper-journey with physical-canvas galaxy center",
  researchGalaxyComposition: {
    viewportOffsetRatio: researchReadingComposition.viewportOffsetRatio,
    readingPaperAnchorNdcX: researchReadingComposition.paperAnchorNdcX,
    effectiveViewportWidthPx: researchReadingComposition.effectiveViewportWidthPx,
  },
  overviewOrbitPivot: {
    canonicalCenter: canonicalOverviewPose.center,
    rejectedTransientCenter: [2.4, -1.2, 0.5],
    restoredDistance: rejectedHotspotPose.distance,
    maximumPivotProjectionError,
  },
  paperJourneyProjectionContinuity: {
    shiftedFixtureAnchorNdcX: shiftedStartAnchor.x,
    canonicalAnchorNdcX: canonicalStartAnchor.x,
    focusStartPositionError,
    focusStartAngleErrorDegrees,
    returnEndPositionError,
    returnEndAngleErrorDegrees,
  },
}, null, 2));
