import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, Gauge, Wallet } from "lucide-react";
import { Card, CardContent } from "../ui/card";
import { cn } from "../../lib/cn";
import type { KpiMetric } from "../../lib/mock-data";
import type { LucideIcon } from "lucide-react";

const iconByMetricLabel: Record<string, LucideIcon> = {
  "Total Products": Boxes,
  "Stock Value": Wallet,
  "Low Stock Items": AlertTriangle,
  "Avg Fulfillment Rate": Gauge
};

export function StatCard({ metric }: { metric: KpiMetric }) {
  const MetricIcon = iconByMetricLabel[metric.label] ?? Boxes;

  return (
    <Card className="wh-stat-card wh-section-card relative overflow-hidden">
      <CardContent>
        <p className="wh-stat-card__label title-with-icon ui-kicker">
          <span className="wh-stat-card__icon title-icon-chip">
            <MetricIcon size={12} />
          </span>
          {metric.label}
        </p>
        <p className="wh-stat-card__value metric-value text-foreground">{metric.value}</p>
        <div className="wh-stat-card__meta inline-flex items-center text-xs font-semibold">
          <span
            className={cn(
              "inline-flex h-6 items-center gap-2 rounded-full px-2.5",
              metric.trend === "up"
                ? "bg-primary/10 text-primary"
                : "bg-destructive/10 text-destructive"
            )}
          >
            {metric.trend === "up" ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
            {metric.delta}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}


