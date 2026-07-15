import { useLabels } from "../../app/use-labels";
import type {
  DashboardMarketplaceStatusCountsDto,
  DashboardMarketplaceStatusKey
} from "./dashboard-api";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

type MarketplaceRow = {
  label: string;
  jv: DashboardMarketplaceStatusKey;
  xl: DashboardMarketplaceStatusKey;
};

const MARKETPLACES: MarketplaceRow[] = [
  { label: "SITES", jv: "jv", xl: "xl" },
  { label: "OTTO", jv: "otto_jv", xl: "otto_xl" },
  { label: "EBAY", jv: "ebay_jv", xl: "ebay_xl" },
  { label: "KAUF", jv: "kaufland_jv", xl: "kaufland_xl" },
  { label: "HOOD", jv: "hood_jv", xl: "hood_xl" }
];

function PublicationCounts({ counts }: { counts: DashboardMarketplaceStatusCountsDto }) {
  return (
    <div className="wh-marketplace-publication__counts">
      <span className="wh-marketplace-publication__count wh-marketplace-publication__count--true">✓ {counts.true_count}</span>
      <span className="wh-marketplace-publication__count wh-marketplace-publication__count--false">× {counts.false_count}</span>
    </div>
  );
}

export function MarketplacePublicationSummary({
  statuses,
  loading
}: {
  statuses?: Record<DashboardMarketplaceStatusKey, DashboardMarketplaceStatusCountsDto>;
  loading?: boolean;
}) {
  const t = useLabels();

  return (
    <Card className="wh-section-card wh-dashboard__marketplace-publication-card">
      <CardContent className="wh-section-card__body">
        {loading ? (
          <div className="wh-marketplace-publication__skeleton">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-[var(--radius-control)]" />
            ))}
          </div>
        ) : (
          <div className="wh-marketplace-publication" aria-label={t.marketplacePublicationStatus}>
            {MARKETPLACES.map((marketplace) => (
              <section key={marketplace.label} className="wh-marketplace-publication__marketplace">
                <strong>{marketplace.label}</strong>
                <div className="wh-marketplace-publication__channel">
                  <span>JV</span>
                  <PublicationCounts counts={statuses?.[marketplace.jv] ?? { true_count: 0, false_count: 0 }} />
                </div>
                <div className="wh-marketplace-publication__channel">
                  <span>XL</span>
                  <PublicationCounts counts={statuses?.[marketplace.xl] ?? { true_count: 0, false_count: 0 }} />
                </div>
              </section>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
