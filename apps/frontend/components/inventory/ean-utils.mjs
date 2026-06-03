export function isEan13(value) {
  return /^[0-9]{13}$/.test(String(value || "").trim());
}

export function normalizeEanOrFallback(value, fallback = "0000000000000") {
  const normalized = String(value || "").trim();
  return normalized.length > 0 ? normalized : fallback;
}
