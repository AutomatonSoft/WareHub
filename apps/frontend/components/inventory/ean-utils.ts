export const PLACEHOLDER_EAN = "0000000000000";

export function isEan13(value: string): boolean {
  return /^[0-9]{13}$/.test(value.trim());
}

export function isMeaningfulEan(value: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== PLACEHOLDER_EAN;
}

export function normalizeEanOrFallback(value: string, fallback = PLACEHOLDER_EAN): string {
  const normalized = value.trim();
  return isMeaningfulEan(normalized) ? normalized : fallback;
}

export function normalizeEanOrEmpty(value: string): string {
  return isMeaningfulEan(value) ? value.trim() : "";
}
