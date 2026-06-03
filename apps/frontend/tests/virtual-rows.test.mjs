import test from "node:test";
import assert from "node:assert/strict";

function computeVirtualRows({
  rowCount,
  rowHeight,
  viewportHeight,
  scrollTop,
  overscan = 4,
  minRowsToVirtualize = 40,
  enabled = true
}) {
  if (!enabled || rowCount < minRowsToVirtualize || rowCount <= 0 || rowHeight <= 0 || viewportHeight <= 0) {
    return {
      startIndex: 0,
      endIndex: Math.max(0, rowCount - 1),
      topSpacerHeight: 0,
      bottomSpacerHeight: 0
    };
  }

  const visibleCount = Math.max(1, Math.ceil(viewportHeight / rowHeight));
  const startIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const endIndex = Math.min(rowCount - 1, startIndex + visibleCount + overscan * 2);
  const topSpacerHeight = startIndex * rowHeight;
  const bottomSpacerHeight = Math.max(0, (rowCount - endIndex - 1) * rowHeight);

  return { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight };
}

test("virtual rows disabled below threshold", () => {
  const result = computeVirtualRows({
    rowCount: 20,
    rowHeight: 100,
    viewportHeight: 500,
    scrollTop: 1200
  });

  assert.equal(result.startIndex, 0);
  assert.equal(result.endIndex, 19);
  assert.equal(result.topSpacerHeight, 0);
  assert.equal(result.bottomSpacerHeight, 0);
});

test("virtual rows computes visible window with overscan", () => {
  const result = computeVirtualRows({
    rowCount: 5000,
    rowHeight: 120,
    viewportHeight: 720,
    scrollTop: 2400,
    overscan: 4
  });

  assert.equal(result.startIndex, 16);
  assert.equal(result.endIndex, 30);
  assert.equal(result.topSpacerHeight, 1920);
  assert.equal(result.bottomSpacerHeight, (5000 - 31) * 120);
});

test("virtual rows clamps to table end", () => {
  const result = computeVirtualRows({
    rowCount: 100,
    rowHeight: 100,
    viewportHeight: 800,
    scrollTop: 9800,
    overscan: 6
  });

  assert.equal(result.endIndex, 99);
  assert.ok(result.startIndex <= result.endIndex);
  assert.equal(result.bottomSpacerHeight, 0);
});

