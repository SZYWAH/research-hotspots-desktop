import assert from "node:assert/strict";

import { computeOcrSelectionRects } from "../src/lib/documentSelectionGeometry.ts";

const pageText = {
  spans: [
    {
      text: "first line",
      startOffsetUtf16: 0,
      endOffsetUtf16: 10,
      x: 0.25,
      y: 0.2,
      width: 0.5,
      height: 0.04,
    },
    {
      text: "second line",
      startOffsetUtf16: 11,
      endOffsetUtf16: 22,
      x: 0.25,
      y: 0.3,
      width: 0.55,
      height: 0.04,
    },
  ],
};

const crossLine = computeOcrSelectionRects(pageText, 5, 17);
assert.equal(crossLine.length, 2);
assert.deepEqual(crossLine[0], {
  x: 0.5,
  y: 0.2,
  width: 0.25,
  height: 0.04,
});
assert.deepEqual(crossLine[1], {
  x: 0.25,
  y: 0.3,
  width: 0.3,
  height: 0.04,
});
assert.ok(crossLine.every((rect) => rect.x >= 0.25), "OCR selection must not fill line-leading whitespace");

const outside = computeOcrSelectionRects(pageText, 23, 30);
assert.deepEqual(outside, []);

console.log(JSON.stringify({
  status: "PASS",
  surface: "document-ocr-selection-geometry",
  crossLineRects: crossLine.length,
  lineLeadingWhitespaceSelected: false,
}));
