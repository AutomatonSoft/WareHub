export function normalizeEanInputLines(input) {
  const seen = new Set();
  const result = [];
  for (const raw of String(input || "").split(/\r?\n/)) {
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

export function isEan13(value) {
  return /^[0-9]{13}$/.test(String(value || "").trim());
}
