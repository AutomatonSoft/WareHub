import { ArrowDownRight, ArrowUpRight, BadgeCheck, Banknote, Boxes, CreditCard, Tag, Truck } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { useLabels } from "../../app/use-labels";
import { cn } from "../../lib/cn";
import type { KpiMetric } from "../../lib/mock-data";
import { StatCard as UIStatCard } from "../ui/stat-card";

const iconByMetricId: Record<KpiMetric["id"], LucideIcon> = {
  total_products: Boxes,
  stock_value: BadgeCheck,
  low_stock_items: CreditCard,
  avg_fulfillment_rate: Banknote,
  in_transit_products: Truck,
  b_ware_products: Tag
};

const accentClassByMetricId: Record<KpiMetric["id"], string> = {
  total_products: "wh-stat-card--products",
  stock_value: "wh-stat-card--value",
  low_stock_items: "wh-stat-card--risk",
  avg_fulfillment_rate: "wh-stat-card--fulfillment",
  in_transit_products: "wh-stat-card--transit",
  b_ware_products: "wh-stat-card--bware"
};

export function StatCard({ metric }: { metric: KpiMetric }) {
  const t = useLabels();
  const MetricIcon = iconByMetricId[metric.id] ?? Boxes;
  const accentClassName = accentClassByMetricId[metric.id] ?? "wh-stat-card--products";

  const localizedMetric = {
    total_products: {
      label: t.totalProducts,
      description: t.warehouseCatalogFootprint
    },
    stock_value: {
      label: t.readyForListing,
      description: metric.delta
    },
    low_stock_items: {
      label: t.paidOrders,
      description: metric.delta
    },
    avg_fulfillment_rate: {
      label: t.paidRevenueLabel,
      description: metric.delta
    },
    in_transit_products: {
      label: t.inTransitProducts,
      description: metric.delta
    },
    b_ware_products: {
      label: t.bWareProducts,
      description: metric.delta
    }
  }[metric.id] ?? {
    label: metric.id,
    description: ""
  };

  return (
    <UIStatCard
      className={cn("wh-stat-card wh-section-card relative overflow-hidden", accentClassName)}
      label={localizedMetric.label}
      value={metric.value}
      description={localizedMetric.description}
      icon={<MetricIcon aria-hidden="true" />}
    >
      <span
        className={cn(
          "wh-stat-card__trend inline-flex min-h-7 w-fit items-center gap-1.5 rounded-[var(--radius-pill)] border px-2.5 py-1 text-[11px] font-semibold leading-none",
          metric.trend === "up"
            ? "bg-primary/10 text-primary"
            : "bg-destructive/10 text-destructive"
        )}
      >
        {metric.trend === "up" ? <ArrowUpRight aria-hidden="true" /> : <ArrowDownRight aria-hidden="true" />}
        {metric.delta}
      </span>
    </UIStatCard>
  );
}
