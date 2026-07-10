import type { ProductEditorGroupId } from "./product-editor-types";

export function getProductEditorTabCopy(t: Record<string, string>): Record<ProductEditorGroupId, { label: string; subtitle: string; tabStatus: string }> {
  return {
    JV: { label: "JV", subtitle: t.productEditorTabSubtitleJv, tabStatus: t.productEditorTabStatusNext },
    XL: { label: "XL", subtitle: t.productEditorTabSubtitleXl, tabStatus: t.productEditorTabStatusPlanned },
    HOOD: { label: "HOOD", subtitle: t.productEditorTabSubtitleHood, tabStatus: t.productEditorTabStatusActive },
    OTTO: { label: "OTTO", subtitle: t.productEditorTabSubtitleOtto, tabStatus: t.productEditorTabStatusPlanned },
    KAUFLAND: { label: "KAUFLAND", subtitle: t.productEditorTabSubtitleKaufland, tabStatus: t.productEditorTabStatusPlanned },
    EBAY: { label: "EBAY", subtitle: t.productEditorTabSubtitleEbay, tabStatus: t.productEditorTabStatusUnsupported }
  };
}

export function getProductEditorPlaceholderDetails(t: Record<string, string>): Record<Exclude<ProductEditorGroupId, "JV" | "HOOD">, string[]> {
  return {
    XL: [
      t.productEditorPlaceholderXl1,
      t.productEditorPlaceholderXl2,
      t.productEditorPlaceholderXl3
    ],
    OTTO: [
      t.productEditorPlaceholderOtto1,
      t.productEditorPlaceholderOtto2
    ],
    KAUFLAND: [
      t.productEditorPlaceholderKaufland1,
      t.productEditorPlaceholderKaufland2
    ],
    EBAY: [
      t.productEditorPlaceholderEbay1,
      t.productEditorPlaceholderEbay2
    ]
  };
}
