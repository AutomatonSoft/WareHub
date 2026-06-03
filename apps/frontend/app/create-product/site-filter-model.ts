import type { MarketplaceSite } from "../../lib/marketplace-sites";

export function sortMarketplaceSitesByName(sites: MarketplaceSite[]): MarketplaceSite[] {
  return [...sites].sort((a, b) => a.name.localeCompare(b.name));
}

export function filterMarketplaceSites(input: {
  sites: MarketplaceSite[];
  query: string;
  showSelectedOnly: boolean;
  selectedSiteIds: string[];
}): MarketplaceSite[] {
  const query = input.query.trim().toLowerCase();
  return input.sites.filter((site) => {
    if (input.showSelectedOnly && !input.selectedSiteIds.includes(site.id)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return site.name.toLowerCase().includes(query);
  });
}
