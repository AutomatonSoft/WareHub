function tokenizeQuery(query) {
  return String(query || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function isMeaningfulValue(value, placeholderEan) {
  const normalized = String(value || "").trim();
  return normalized.length > 0 && normalized !== placeholderEan && normalized !== "—";
}

function buildCellState(key, value, placeholderEan, tokens) {
  const normalized = String(value || "").trim();
  const isEmpty = !isMeaningfulValue(normalized, placeholderEan);
  const searchable = normalized.toLowerCase();
  const matches = !isEmpty && tokens.length > 0 && tokens.every((token) => searchable.includes(token));
  return { key, value, matches, isEmpty };
}

export function buildMarketplaceMatrixRows(siteEans, query, placeholderEan) {
  const tokens = tokenizeQuery(query);
  const rows = [
    { market: "SITES", keys: ["jv", "xl"] },
    { market: "OTTO", keys: ["ottoJv", "ottoXl"] },
    { market: "EBAY", keys: ["ebayJv", "ebayXl"] },
    { market: "KAUFLAND", keys: ["kauflandJv", "kauflandXl"] },
    { market: "HOOD", keys: ["hoodJv", "hoodXl"] }
  ];

  return rows.map(({ market, keys }) => {
    const cells = [
      buildCellState(keys[0], siteEans[keys[0]], placeholderEan, tokens),
      buildCellState(keys[1], siteEans[keys[1]], placeholderEan, tokens)
    ];
    return {
      market,
      cells,
      hasMatch: cells.some((cell) => cell.matches)
    };
  });
}
