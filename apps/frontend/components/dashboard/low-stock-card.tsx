import { AlertTriangle, Boxes } from "lucide-react";
import Link from "next/link";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

type LowStockAlert = {
  id: string;
  name: string;
  sku: string;
  qty: number;
};

export function LowStockCard({
  alerts,
  totalAlerts,
  loading
}: {
  alerts?: LowStockAlert[];
  totalAlerts?: number;
  loading?: boolean;
}) {
  const displayAlerts = alerts ?? [];
  const resolvedTotalAlerts = totalAlerts ?? displayAlerts.length;
  const hasHiddenAlerts = resolvedTotalAlerts > displayAlerts.length;

  return (
    <Card className="wh-section-card wh-dashboard__low-stock-card min-w-0">
      <CardHeader className="wh-section-card__header wh-dashboard__compact-header">
        <CardTitle className="title-with-icon wh-section-card__title">
          <span className="title-icon-chip"><Boxes size={14} /></span>
          Low Stock Alerts
        </CardTitle>
        {loading ? (
          <Skeleton className="h-7 w-20 rounded-full" />
        ) : (
          <Badge variant="secondary">{resolvedTotalAlerts} Items</Badge>
        )}
      </CardHeader>
      <CardContent className="wh-section-card__body">
      {loading ? (
        <div className="wh-low-stock-list">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={`low-stock-skeleton-${index}`} className="wh-low-stock-row">
                <div className="space-y-3">
                  <Skeleton className="h-4 w-44" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
            </div>
          ))}
        </div>
      ) : displayAlerts.length === 0 ? (
        <div className="wh-empty-state wh-empty-state--dashboard">
          <AlertTriangle className="size-5 text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">No low stock alerts yet</p>
          <p className="text-xs text-muted-foreground">Restock recommendations are generated every 4 hours.</p>
        </div>
      ) : (
        <div className={`wh-low-stock-list scrollbar-thin ${hasHiddenAlerts ? "wh-low-stock-list--with-footer" : ""}`}>
          {displayAlerts.map((alert) => (
            <div key={alert.id} className="wh-low-stock-row">
              <div className="min-w-0">
                <p className="wh-low-stock-row__title" title={alert.name}>{alert.name}</p>
                <p className="wh-low-stock-row__meta" title={alert.sku}>{alert.sku}</p>
              </div>
              <Badge className="wh-low-stock-row__qty" variant={alert.qty < 6 ? "destructive" : "secondary"}>
                {alert.qty} left
              </Badge>
            </div>
          ))}
        </div>
      )}
      {!loading && hasHiddenAlerts ? (
        <div className="wh-card-footer">
          <p className="wh-card-footer__text">
            {displayAlerts.length} of {resolvedTotalAlerts} shown
          </p>
          <Link href="/inventory" className="wh-card-footer__action">
            Open inventory
          </Link>
        </div>
      ) : null}
      </CardContent>
    </Card>
  );
}
