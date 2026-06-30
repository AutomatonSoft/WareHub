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
] as const;

export function resolveMarketplaceActive(item: Record<string, unknown>): boolean | null {
  const rawStatus = item.ean_status;
  if (!rawStatus || typeof rawStatus !== "object") return null;

  let hasBoolean = false;
  for (const key of STATUS_KEYS) {
    const value = (rawStatus as Record<string, unknown>)[key];
    if (typeof value !== "boolean") continue;
    hasBoolean = true;
    if (value) return true;
  }

  return hasBoolean ? false : null;
}
