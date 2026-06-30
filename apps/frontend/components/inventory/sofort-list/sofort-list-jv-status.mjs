const STATUS_KEYS = [
  "jv",
  "xl",
  "otto_jv",
  "otto_xl",
  "ebay_jv",
  "ebay_xl",
  "kaufland_jv",
  "kaufland_xl",
  "hood_jv",
  "hood_xl",
];

export function resolveMarketplaceActive(item) {
  const rawStatus = item?.ean_status;
  if (!rawStatus || typeof rawStatus !== "object") return null;

  let hasBoolean = false;
  for (const key of STATUS_KEYS) {
    const value = rawStatus[key];
    if (typeof value !== "boolean") continue;
    hasBoolean = true;
    if (value) return true;
  }

  return hasBoolean ? false : null;
}
