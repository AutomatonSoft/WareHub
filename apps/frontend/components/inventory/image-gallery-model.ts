export type GalleryImageItem = {
  id: string;
  url: string;
  isMain: boolean;
  order: number;
  source: "ftp" | "external" | "unknown";
  status: "ready" | "invalid";
  publicUrl: string;
  retryState: "none" | "required";
};

export type KidImageGalleryModel = {
  mainImageUrl: string | null;
  originalImageUrls: string[];
  items: GalleryImageItem[];
};

function normalizeUrls(photo: unknown): string[] {
  if (Array.isArray(photo)) {
    return photo
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (typeof photo === "string") {
    const value = photo.trim();
    return value ? [value] : [];
  }
  return [];
}

function resolveSource(url: string): "ftp" | "external" | "unknown" {
  const lower = url.toLowerCase();
  if (lower.includes("/uploads/") || lower.includes("/media/") || lower.includes("ftp")) {
    return "ftp";
  }
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return "external";
  }
  return "unknown";
}

function resolveStatus(url: string): "ready" | "invalid" {
  const trimmed = url.trim();
  if (!trimmed) return "invalid";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return "ready";
  }
  return "invalid";
}

export function buildKidImageGalleryModel(photo: unknown): KidImageGalleryModel {
  const originalImageUrls = normalizeUrls(photo);
  const items: GalleryImageItem[] = originalImageUrls.map((url, index) => {
    const status = resolveStatus(url);
    return {
      id: `img-${index + 1}`,
      url,
      isMain: index === 0,
      order: index,
      source: resolveSource(url),
      status,
      publicUrl: url,
      retryState: status === "invalid" ? "required" : "none"
    };
  });

  return {
    mainImageUrl: originalImageUrls[0] ?? null,
    originalImageUrls,
    items
  };
}

export function mergeUniqueImageUrls(current: string[], incoming: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const source of [current, incoming]) {
    for (const raw of source) {
      const url = String(raw || "").trim();
      if (!url || seen.has(url)) continue;
      seen.add(url);
      result.push(url);
    }
  }
  return result;
}
