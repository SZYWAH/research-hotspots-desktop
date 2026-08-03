export type GalaxyContextRailMode =
  | "closed"
  | "hotspot"
  | "paper-summary"
  | "paper-reading";

export type ResearchGalaxyContextComposition = {
  railMode: GalaxyContextRailMode;
  railWidthPx: number;
  effectiveViewportWidthPx: number;
  viewportOffsetRatio: number;
  paperAnchorNdcX: number;
};

export type GalaxyOverviewCameraPose = {
  center: [number, number, number];
  distance: number;
  azimuth: number;
  elevation: number;
};

export type GalaxyOverviewSceneFrame = {
  mode: string;
  center: [number, number, number];
  distance: number;
};

export type GalaxyOverviewPoseResolution = GalaxyOverviewCameraPose & {
  restoration: "canonical-default" | "overview-pose" | "canonical-default-transient-center";
};

const RESEARCH_GALAXY_RAIL_GAP_PX = 24;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const finiteVector3 = (value: readonly number[] | undefined): value is readonly [number, number, number] =>
  Boolean(value && value.length === 3 && value.every(Number.isFinite));

const vector3Distance = (left: readonly number[], right: readonly number[]) =>
  Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);

/**
 * Restore only overview camera poses. A system or paper pose carries a hotspot
 * pivot and must never replace the canonical center of a rebuilt overview.
 */
export function resolveGalaxyOverviewCameraPose({
  mode,
  canonicalPose,
  restoredPose,
  previousSceneFrame,
  minimumDistance,
  maximumDistance,
  minimumElevation,
  maximumElevation,
}: {
  mode: string;
  canonicalPose: GalaxyOverviewCameraPose;
  restoredPose?: GalaxyOverviewCameraPose;
  previousSceneFrame?: GalaxyOverviewSceneFrame;
  minimumDistance: number;
  maximumDistance: number;
  minimumElevation: number;
  maximumElevation: number;
}): GalaxyOverviewPoseResolution {
  const canonical: GalaxyOverviewPoseResolution = {
    center: [...canonicalPose.center],
    distance: canonicalPose.distance,
    azimuth: canonicalPose.azimuth,
    elevation: canonicalPose.elevation,
    restoration: "canonical-default",
  };
  if (
    !restoredPose
    || !finiteVector3(restoredPose.center)
    || !Number.isFinite(restoredPose.distance)
    || !Number.isFinite(restoredPose.azimuth)
    || !Number.isFinite(restoredPose.elevation)
  ) return canonical;

  const expectedRestoredCenter = previousSceneFrame?.center ?? canonicalPose.center;
  const centerTolerance = Math.max(1e-5, canonicalPose.distance * 1e-5);
  if (vector3Distance(restoredPose.center, expectedRestoredCenter) > centerTolerance) {
    return {
      ...canonical,
      restoration: "canonical-default-transient-center",
    };
  }

  const distanceScale = previousSceneFrame && previousSceneFrame.mode !== mode
    ? canonicalPose.distance / Math.max(0.001, previousSceneFrame.distance)
    : 1;
  return {
    center: [...canonicalPose.center],
    distance: clamp(restoredPose.distance * distanceScale, minimumDistance, maximumDistance),
    azimuth: restoredPose.azimuth,
    elevation: clamp(restoredPose.elevation, minimumElevation, maximumElevation),
    restoration: "overview-pose",
  };
}

export function resolveGalaxyContextRailWidth(
  mode: GalaxyContextRailMode,
  viewportWidth: number,
) {
  if (mode === "closed") return 0;
  if (viewportWidth < 900) return Math.max(0, Math.min(440, viewportWidth - 32));
  if (mode === "hotspot") return clamp(viewportWidth * 0.2, 360, 400);
  if (mode === "paper-summary") return clamp(viewportWidth * 0.24, 420, 480);
  return clamp(viewportWidth * 0.29, 500, 580);
}

/**
 * Keep the research galaxy centered in the physical canvas. Context rails are
 * overlays; only a focused paper moves into the unobstructed region beside a
 * summary or reading rail.
 */
export function resolveResearchGalaxyContextComposition(
  mode: GalaxyContextRailMode,
  viewportWidth: number,
): ResearchGalaxyContextComposition {
  const safeViewportWidth = Math.max(1, viewportWidth);
  const railWidthPx = resolveGalaxyContextRailWidth(mode, safeViewportWidth);
  const paperFocused = mode === "paper-summary" || mode === "paper-reading";
  const reservedWidthPx = railWidthPx > 0
    ? railWidthPx + RESEARCH_GALAXY_RAIL_GAP_PX
    : 0;

  return {
    railMode: mode,
    railWidthPx,
    effectiveViewportWidthPx: Math.max(0, safeViewportWidth - reservedWidthPx),
    viewportOffsetRatio: 0,
    paperAnchorNdcX: paperFocused ? -reservedWidthPx / safeViewportWidth : 0,
  };
}
