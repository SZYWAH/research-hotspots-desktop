export const THEORY_SYSTEM_FADE_START = 0.7;
export const THEORY_SYSTEM_FADE_END = 1;
export const THEORY_SYSTEM_PAPER_OPACITY = 0;
export const THEORY_SYSTEM_HOTSPOT_CORE_OPACITY = 0;
export const THEORY_SYSTEM_HOTSPOT_HALO_OPACITY = 0;
export const THEORY_SYSTEM_HOTSPOT_RAY_OPACITY = 0;

export type GalaxyTheorySystemVisibility = {
  fadeProgress: number;
  paperOpacity: number;
  hotspotCoreOpacity: number;
  hotspotHaloOpacity: number;
  hotspotRayOpacity: number;
};

export function clampUnit(value: number) {
  return Math.min(1, Math.max(0, value));
}

export function smoothUnit(value: number) {
  const clamped = clampUnit(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export function resolveTheorySystemVisibility(progress: number): GalaxyTheorySystemVisibility {
  const fadeProgress = smoothUnit(
    (progress - THEORY_SYSTEM_FADE_START)
      / Math.max(1e-9, THEORY_SYSTEM_FADE_END - THEORY_SYSTEM_FADE_START),
  );
  return {
    fadeProgress,
    paperOpacity: 1 + (THEORY_SYSTEM_PAPER_OPACITY - 1) * fadeProgress,
    hotspotCoreOpacity: 1 + (THEORY_SYSTEM_HOTSPOT_CORE_OPACITY - 1) * fadeProgress,
    hotspotHaloOpacity: 1 + (THEORY_SYSTEM_HOTSPOT_HALO_OPACITY - 1) * fadeProgress,
    hotspotRayOpacity: 1 + (THEORY_SYSTEM_HOTSPOT_RAY_OPACITY - 1) * fadeProgress,
  };
}

export function normalizeEntryScale(value: number) {
  return Math.min(1, Math.max(1e-4, Number.isFinite(value) ? value : 1));
}

export function distanceAfterSimilarityRebase(
  distance: number,
  entryScale: number,
  toCanonical: boolean,
) {
  const scale = normalizeEntryScale(entryScale);
  return toCanonical ? distance / scale : distance * scale;
}

export function rebaseRelativePoint(
  point: readonly [number, number, number],
  entryScale: number,
  toCanonical: boolean,
): [number, number, number] {
  const scale = normalizeEntryScale(entryScale);
  const factor = toCanonical ? 1 / scale : scale;
  return [point[0] * factor, point[1] * factor, point[2] * factor];
}

export function projectedRatioAfterSimilarityRebase(
  point: readonly [number, number, number],
  camera: readonly [number, number, number],
  entryScale: number,
  toCanonical: boolean,
) {
  const rebasedPoint = rebaseRelativePoint(point, entryScale, toCanonical);
  const rebasedCamera = rebaseRelativePoint(camera, entryScale, toCanonical);
  const beforeDepth = Math.max(1e-9, Math.abs(camera[2] - point[2]));
  const afterDepth = Math.max(1e-9, Math.abs(rebasedCamera[2] - rebasedPoint[2]));
  return {
    beforeX: (point[0] - camera[0]) / beforeDepth,
    beforeY: (point[1] - camera[1]) / beforeDepth,
    afterX: (rebasedPoint[0] - rebasedCamera[0]) / afterDepth,
    afterY: (rebasedPoint[1] - rebasedCamera[1]) / afterDepth,
  };
}
