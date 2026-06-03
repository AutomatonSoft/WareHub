function normalizeUrls(photo) {
  if (Array.isArray(photo)) {
    return photo
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  }
  if (typeof photo === "string") {
    const value = photo.trim();
    return value ? [value] : [];
  }
  return [];
}

function resolveSource(url) {
  const lower = url.toLowerCase();
  if (lower.includes("/uploads/") || lower.includes("/media/") || lower.includes("ftp")) {
    return "ftp";
  }
  if (lower.startsWith("http://") || lower.startsWith("https://")) {
    return "external";
  }
  return "unknown";
}

function resolveStatus(url) {
  const trimmed = url.trim();
  if (!trimmed) return "invalid";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://") || trimmed.startsWith("/")) {
    return "ready";
  }
  return "invalid";
}

export function buildKidImageGalleryModel(photo) {
  const originalImageUrls = normalizeUrls(photo);
  const items = originalImageUrls.map((url, index) => {
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

export function mergeUniqueImageUrls(current, incoming) {
  const seen = new Set();
  const result = [];
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
