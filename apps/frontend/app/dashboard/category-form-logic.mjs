export function normalizeOptionalSelection(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function applyMainCategoryChange(mainCategory) {
  return {
    categoryMain: normalizeOptionalSelection(mainCategory),
    categorySub: null
  };
}

export function buildCategoryPayload(categoryMain, categorySub) {
  const main = normalizeOptionalSelection(categoryMain);
  const sub = normalizeOptionalSelection(categorySub);
  return {
    category_main: main,
    category_sub: main ? sub : null
  };
}
