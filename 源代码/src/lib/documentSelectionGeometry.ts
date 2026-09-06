import type { DocumentPageRect, DocumentPageText } from "./documentReaderContract";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function computeOcrSelectionRects(
  pageText: Pick<DocumentPageText, "spans">,
  startOffsetUtf16: number,
  endOffsetUtf16: number,
): DocumentPageRect[] {
  return pageText.spans.flatMap((span) => {
    const overlapStart = Math.max(startOffsetUtf16, span.startOffsetUtf16);
    const overlapEnd = Math.min(endOffsetUtf16, span.endOffsetUtf16);
    if (overlapEnd <= overlapStart) return [];
    const spanLength = Math.max(1, span.endOffsetUtf16 - span.startOffsetUtf16);
    const startRatio = clamp((overlapStart - span.startOffsetUtf16) / spanLength, 0, 1);
    const endRatio = clamp((overlapEnd - span.startOffsetUtf16) / spanLength, startRatio, 1);
    return [{
      x: clamp(span.x + span.width * startRatio, 0, 1),
      y: clamp(span.y, 0, 1),
      width: clamp(span.width * (endRatio - startRatio), 0, 1),
      height: clamp(span.height, 0, 1),
    }];
  }).filter((rect) => rect.width > 0 && rect.height > 0);
}
