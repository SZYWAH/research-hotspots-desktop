export const SIDERA_COMPOSER_MIN_HEIGHT_PX = 42;
export const SIDERA_COMPOSER_MAX_HEIGHT_PX = 100;
export const SIDERA_COMPOSER_TRACK_PADDING_BLOCK_PX = 6;
export const SIDERA_COMPOSER_TEXTAREA_MIN_HEIGHT_PX = 20;
export const SIDERA_COMPOSER_TEXTAREA_MAX_HEIGHT_PX =
  SIDERA_COMPOSER_MAX_HEIGHT_PX - SIDERA_COMPOSER_TRACK_PADDING_BLOCK_PX * 2;

export type SideraComposerHeight = {
  heightPx: number;
  textareaHeightPx: number;
  overflowY: "hidden" | "auto";
};

export function resolveSideraComposerHeight(
  value: string,
  scrollHeight: number,
): SideraComposerHeight {
  if (value.length === 0) {
    return {
      heightPx: SIDERA_COMPOSER_MIN_HEIGHT_PX,
      textareaHeightPx: SIDERA_COMPOSER_TEXTAREA_MIN_HEIGHT_PX,
      overflowY: "hidden",
    };
  }

  const measuredHeight = Number.isFinite(scrollHeight)
    ? Math.ceil(scrollHeight)
    : SIDERA_COMPOSER_TEXTAREA_MIN_HEIGHT_PX;
  const textareaHeightPx = Math.min(
    SIDERA_COMPOSER_TEXTAREA_MAX_HEIGHT_PX,
    Math.max(SIDERA_COMPOSER_TEXTAREA_MIN_HEIGHT_PX, measuredHeight),
  );
  const heightPx = Math.max(
    SIDERA_COMPOSER_MIN_HEIGHT_PX,
    textareaHeightPx + SIDERA_COMPOSER_TRACK_PADDING_BLOCK_PX * 2,
  );

  return {
    heightPx,
    textareaHeightPx,
    overflowY: measuredHeight > SIDERA_COMPOSER_TEXTAREA_MAX_HEIGHT_PX ? "auto" : "hidden",
  };
}
