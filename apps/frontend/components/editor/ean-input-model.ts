export function normalizeEanInputLines(input: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of input.split(/\r?\n/)) {
    const value = raw.trim();
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      continue;
    }
    seen.add(value);
    result.push(value);
  }
  return result;
}

export function isEan13(value: string): boolean {
  return /^[0-9]{13}$/.test(value.trim());
}
