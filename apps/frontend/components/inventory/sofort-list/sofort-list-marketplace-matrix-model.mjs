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

function buildCellState(key, value, placeholderEan, tokens, isBWare) {
  const normalized = isBWare ? "B_WARE" : String(value || "").trim();
  const isEmpty = !isMeaningfulValue(normalized, placeholderEan);
  const searchable = normalized.toLowerCase();
  const matches = !isEmpty && tokens.length > 0 && tokens.every((token) => searchable.includes(token));
  return { key, value: normalized, matches, isEmpty, isBWare };
}

export function buildMarketplaceMatrixRows(siteEans, query, placeholderEan, bWare = false) {
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
      buildCellState(keys[0], siteEans[keys[0]], placeholderEan, tokens, bWare && market === "OTTO"),
      buildCellState(keys[1], siteEans[keys[1]], placeholderEan, tokens, bWare && market === "OTTO")
    ];
    return {
      market,
      cells,
      hasMatch: cells.some((cell) => cell.matches)
    };
  });
}
