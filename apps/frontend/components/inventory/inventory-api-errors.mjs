export function formatApiErrorText(status, errorText, fallbackPrefix) {
  const suffix = String(errorText || "").trim() ? ` - ${String(errorText || "").trim()}` : "";
  return `${fallbackPrefix} HTTP ${status}${suffix}`;
}
