export type SideraInstitutionBrowserPresentation = "closed" | "split" | "immersive";

export type SideraInstitutionNarrowPane = "native" | "browser";

export const SIDERA_INSTITUTION_BROWSER_LAYOUT_STORAGE_KEY =
  "research-agent:sidera-institution-browser-layout:v1";
export const SIDERA_INSTITUTION_BROWSER_NARROW_BREAKPOINT = 1180;
export const SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO = 0.5;
export const SIDERA_INSTITUTION_BROWSER_MIN_RATIO = 0.3;
export const SIDERA_INSTITUTION_BROWSER_MAX_RATIO = 0.7;
export const SIDERA_INSTITUTION_NATIVE_MIN_WIDTH = 420;
export const SIDERA_INSTITUTION_BROWSER_MIN_WIDTH = 640;
export const SIDERA_INSTITUTION_BROWSER_DIVIDER_WIDTH = 8;

export type SideraInstitutionSplitLayout = {
  narrow: boolean;
  ratio: number;
  nativeWidth: number;
  browserWidth: number;
};

function finiteRatio(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseSideraInstitutionBrowserLayout(raw: string | null | undefined) {
  if (!raw) return SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO;
  try {
    const parsed = JSON.parse(raw) as unknown;
    const candidate = finiteRatio(parsed)
      ?? finiteRatio((parsed as { splitRatio?: unknown } | null)?.splitRatio);
    if (
      candidate === null
      || candidate < SIDERA_INSTITUTION_BROWSER_MIN_RATIO
      || candidate > SIDERA_INSTITUTION_BROWSER_MAX_RATIO
    ) return SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO;
    return candidate;
  } catch {
    return SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO;
  }
}

export function serializeSideraInstitutionBrowserLayout(splitRatio: number) {
  const safeRatio = Number.isFinite(splitRatio)
    ? Math.min(
      SIDERA_INSTITUTION_BROWSER_MAX_RATIO,
      Math.max(SIDERA_INSTITUTION_BROWSER_MIN_RATIO, splitRatio),
    )
    : SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO;
  return JSON.stringify({ splitRatio: safeRatio });
}

export function resolveSideraInstitutionSplitLayout(
  containerWidth: number,
  preferredRatio: number,
): SideraInstitutionSplitLayout {
  const safeWidth = Number.isFinite(containerWidth) ? Math.max(0, containerWidth) : 0;
  const narrow = safeWidth < SIDERA_INSTITUTION_BROWSER_NARROW_BREAKPOINT;
  const availableWidth = Math.max(0, safeWidth - SIDERA_INSTITUTION_BROWSER_DIVIDER_WIDTH);
  const requestedRatio = Number.isFinite(preferredRatio)
    ? Math.min(
      SIDERA_INSTITUTION_BROWSER_MAX_RATIO,
      Math.max(SIDERA_INSTITUTION_BROWSER_MIN_RATIO, preferredRatio),
    )
    : SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO;

  if (narrow || availableWidth === 0) {
    return {
      narrow: true,
      ratio: requestedRatio,
      nativeWidth: safeWidth,
      browserWidth: safeWidth,
    };
  }

  const minimumRatio = Math.max(
    SIDERA_INSTITUTION_BROWSER_MIN_RATIO,
    SIDERA_INSTITUTION_NATIVE_MIN_WIDTH / availableWidth,
  );
  const maximumRatio = Math.min(
    SIDERA_INSTITUTION_BROWSER_MAX_RATIO,
    1 - SIDERA_INSTITUTION_BROWSER_MIN_WIDTH / availableWidth,
  );
  const ratio = minimumRatio <= maximumRatio
    ? Math.min(maximumRatio, Math.max(minimumRatio, requestedRatio))
    : SIDERA_INSTITUTION_BROWSER_DEFAULT_RATIO;
  const nativeWidth = availableWidth * ratio;

  return {
    narrow: false,
    ratio,
    nativeWidth,
    browserWidth: availableWidth - nativeWidth,
  };
}
