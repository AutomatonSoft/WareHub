export function extractUploadedImageUrls(payload) {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const raw = payload.uploaded_image_urls;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

