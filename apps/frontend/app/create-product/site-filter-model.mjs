export function sortMarketplaceSitesByName(sites) {
  return [...(Array.isArray(sites) ? sites : [])].sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
}

export function filterMarketplaceSites(input) {
  const sites = Array.isArray(input?.sites) ? input.sites : [];
  const query = String(input?.query || "").trim().toLowerCase();
  const showSelectedOnly = Boolean(input?.showSelectedOnly);
  const selectedSiteIds = Array.isArray(input?.selectedSiteIds) ? input.selectedSiteIds : [];

  return sites.filter((site) => {
    if (showSelectedOnly && !selectedSiteIds.includes(site.id)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return String(site?.name || "").toLowerCase().includes(query);
  });
}
