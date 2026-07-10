import type { MarketplaceSite } from "../../lib/marketplace-sites";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { Checkbox } from "../../components/ui/checkbox";
import { EmptyState } from "../../components/ui/empty-state";
import { Input } from "../../components/ui/input";

type Labels = Record<string, string>;

type Props = {
  t: Labels;
  selectedSitesCount: number;
  sitesQuery: string;
  showSelectedOnly: boolean;
  visibleSites: MarketplaceSite[];
  selectedSiteIds: string[];
  onSitesQueryChange: (value: string) => void;
  onSelectAllSites: () => void;
  onClearAllSites: () => void;
  onToggleShowSelectedOnly: () => void;
  onToggleSite: (siteId: string) => void;
};

export function MarketplaceSiteSelectorPanel(props: Props) {
  const {
    t,
    selectedSitesCount,
    sitesQuery,
    showSelectedOnly,
    visibleSites,
    selectedSiteIds,
    onSitesQueryChange,
    onSelectAllSites,
    onClearAllSites,
    onToggleShowSelectedOnly,
    onToggleSite
  } = props;

  return (
    <Card className="wh-page-card h-full xl:sticky xl:top-4 xl:max-h-[calc(100vh-8rem)] xl:overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t.sites}</CardTitle>
          <Badge variant="secondary">{t.selected}: {selectedSitesCount}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <Input
          value={sitesQuery}
          onChange={(event) => onSitesQueryChange(event.target.value)}
          placeholder={t.searchMarketplacePlaceholder}
          className="h-11"
          aria-label={t.searchMarketplaceSitesAria}
        />
      <div className="wh-secondary-toolbar flex flex-wrap gap-2">
        <Button variant="outline" className="h-10 px-4 text-sm" onClick={onSelectAllSites}>{t.selectAll}</Button>
        <Button variant="outline" className="h-10 px-4 text-sm" onClick={onClearAllSites}>{t.clear}</Button>
        <Button variant="secondary" className="h-10 px-4 text-sm" onClick={onToggleShowSelectedOnly}>
          {showSelectedOnly ? t.allSites : t.selectedOnly}
        </Button>
      </div>
      <div className="wh-site-list min-h-0 flex-1 space-y-2 overflow-y-auto rounded-xl bg-muted/30 p-2 pr-1 xl:max-h-[calc(100vh-18rem)]">
        {visibleSites.map((site) => (
          <label
            key={site.id}
            className="wh-site-list-row flex items-center gap-3 rounded-xl border border-transparent bg-background/70 px-3 py-2 text-sm transition hover:border-border hover:bg-background"
          >
            <Checkbox
              checked={selectedSiteIds.includes(site.id)}
              onCheckedChange={() => onToggleSite(site.id)}
            />
            <span className="truncate">{site.name}</span>
          </label>
        ))}
        {visibleSites.length === 0 ? (
          <EmptyState
            title={t.noSitesFound}
            description={t.noSitesFoundDescription}
            className="border-none bg-transparent p-4"
          />
        ) : null}
      </div>
      </CardContent>
    </Card>
  );
}

