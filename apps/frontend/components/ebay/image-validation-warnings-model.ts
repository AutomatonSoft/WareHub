export type ExcludedEbayImage = {
  target: string;
  url: string;
  reason: "duplicate" | "too_small";
  width?: number;
  height?: number;
};

export function excludedEbayImages(payload: unknown): ExcludedEbayImage[] {
  if (typeof payload === "string") {
    try {
      payload = JSON.parse(payload);
    } catch {
      return [];
    }
  }
  const images: ExcludedEbayImage[] = [];
  const seen = new Set<string>();
  function visit(value: unknown, target = "eBay", depth = 0) {
    if (!value || typeof value !== "object" || depth > 12) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => visit(entry, target, depth + 1));
      return;
    }
    const record = value as Record<string, unknown>;
    const label = record.target_id ?? record.site_key ?? record.target ?? record.account;
    if (typeof label === "string" && label.trim()) target = label;
    if (Array.isArray(record.removed_images)) {
      for (const image of record.removed_images) {
        if (!image || typeof image !== "object") continue;
        const { url, reason, width, height } = image;
        if (typeof url !== "string" || (reason !== "duplicate" && reason !== "too_small")) continue;
        const key = JSON.stringify([target, url, reason]);
        if (seen.has(key)) continue;
        seen.add(key);
        images.push({ target, url, reason, width: typeof width === "number" ? width : undefined, height: typeof height === "number" ? height : undefined });
      }
    }
    Object.entries(record).forEach(([key, entry]) => {
      if (key !== "removed_images") visit(entry, target, depth + 1);
    });
  }
  visit(payload);
  return images;
}
