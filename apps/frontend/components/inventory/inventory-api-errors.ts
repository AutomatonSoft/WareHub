export function formatApiErrorText(status: number, errorText: string, fallbackPrefix: string): string {
  const suffix = errorText.trim() ? ` - ${errorText.trim()}` : "";
  return `${fallbackPrefix} HTTP ${status}${suffix}`;
}
