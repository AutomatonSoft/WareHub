export function normalizeOptionalSelection(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function applyMainCategoryChange(mainCategory: unknown): {
  categoryMain: string | null;
  categorySub: null;
} {
  return {
    categoryMain: normalizeOptionalSelection(mainCategory),
    categorySub: null
  };
}

export function buildCategoryPayload(
  categoryMain: unknown,
  categorySub: unknown
): {
  category_main: string | null;
  category_sub: string | null;
} {
  const main = normalizeOptionalSelection(categoryMain);
  const sub = normalizeOptionalSelection(categorySub);
  return {
    category_main: main,
    category_sub: main ? sub : null
  };
}
