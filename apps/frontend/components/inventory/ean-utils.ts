export function isEan13(value: string): boolean {
  return /^[0-9]{13}$/.test(value.trim());
}

export function normalizeEanOrFallback(value: string, fallback = "0000000000000"): string {
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : fallback;
}
