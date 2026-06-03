"use client";

import { useMemo } from "react";

type UseVirtualRowsParams = {
  rowCount: number;
  rowHeight: number;
  viewportHeight: number;
  scrollTop: number;
  overscan?: number;
  minRowsToVirtualize?: number;
  enabled?: boolean;
};

type VirtualRowsResult = {
  startIndex: number;
  endIndex: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
};

export function useVirtualRows({
  rowCount,
  rowHeight,
  viewportHeight,
  scrollTop,
  overscan = 4,
  minRowsToVirtualize = 40,
  enabled = true
}: UseVirtualRowsParams): VirtualRowsResult {
  return useMemo(() => {
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
  }, [enabled, minRowsToVirtualize, overscan, rowCount, rowHeight, scrollTop, viewportHeight]);
}
