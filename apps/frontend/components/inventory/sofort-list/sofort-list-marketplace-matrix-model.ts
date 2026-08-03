import type { SofortListRow } from "./sofort-list-types";

type MarketplaceKey = keyof SofortListRow["siteEans"];

export type MarketplaceMatrixCellState = {
  key: MarketplaceKey;
  value: string;
  status: boolean | null;
  matches: boolean;
  isEmpty: boolean;
  isBWare: boolean;
};

export type MarketplaceMatrixRowState = {
  market: string;
  cells: [MarketplaceMatrixCellState, MarketplaceMatrixCellState];
  hasMatch: boolean;
};

function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function isMeaningfulValue(value: string, placeholderEan: string): boolean {
  const normalized = value.trim();
  return normalized.length > 0 && normalized !== placeholderEan && normalized !== "—";
}

function buildCellState(
  key: MarketplaceKey,
  value: string,
  status: boolean | null,
  placeholderEan: string,
  tokens: string[],
  isBWare: boolean,
): MarketplaceMatrixCellState {
  const normalized = isBWare ? "B_WARE" : value.trim();
  const isEmpty = !isMeaningfulValue(normalized, placeholderEan);
  const searchable = normalized.toLowerCase();
  const matches = !isEmpty && tokens.length > 0 && tokens.every((token) => searchable.includes(token));
  return { key, value: normalized, status, matches, isEmpty, isBWare };
}

export function buildMarketplaceMatrixRows(
  siteEans: SofortListRow["siteEans"],
  siteEanStatuses: SofortListRow["siteEanStatuses"],
  query: string,
  placeholderEan: string,
  bWare: boolean
): MarketplaceMatrixRowState[] {
  const tokens = tokenizeQuery(query);
  const rows: Array<{ market: string; keys: [MarketplaceKey, MarketplaceKey] }> = [
    { market: "SITES", keys: ["jv", "xl"] },
    { market: "OTTO", keys: ["ottoJv", "ottoXl"] },
    { market: "EBAY", keys: ["ebayJv", "ebayXl"] },
    { market: "KAUF", keys: ["kauflandJv", "kauflandXl"] },
    { market: "HOOD", keys: ["hoodJv", "hoodXl"] }
  ];

  return rows.map(({ market, keys }) => {
    const cells: [MarketplaceMatrixCellState, MarketplaceMatrixCellState] = [
      buildCellState(
        keys[0],
        siteEans[keys[0]],
        siteEanStatuses[keys[0]],
        placeholderEan,
        tokens,
        bWare && market === "OTTO",
      ),
      buildCellState(
        keys[1],
        siteEans[keys[1]],
        siteEanStatuses[keys[1]],
        placeholderEan,
        tokens,
        bWare && market === "OTTO",
      )
    ];
    return {
      market,
      cells,
      hasMatch: cells.some((cell) => cell.matches),
    };
  });
}
