import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, Gauge, Wallet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { StatCard as UIStatCard } from "../ui/stat-card";
import { cn } from "../../lib/cn";
import type { KpiMetric } from "../../lib/mock-data";

const iconByMetricLabel: Record<string, LucideIcon> = {
  "Total Products": Boxes,
  "Stock Value": Wallet,
  "Low Stock Items": AlertTriangle,
  "Avg Fulfillment Rate": Gauge
};

const descriptionByMetricLabel: Record<string, string> = {
  "Total Products": "Warehouse catalog footprint",
  "Stock Value": "Priced inventory exposure",
  "Low Stock Items": "Orders pending replenishment",
  "Avg Fulfillment Rate": "Paid orders against total volume"
};

const accentClassByMetricLabel: Record<string, string> = {
  "Total Products": "wh-stat-card--products",
  "Stock Value": "wh-stat-card--value",
  "Low Stock Items": "wh-stat-card--risk",
  "Avg Fulfillment Rate": "wh-stat-card--fulfillment"
};

export function StatCard({ metric }: { metric: KpiMetric }) {
  const MetricIcon = iconByMetricLabel[metric.label] ?? Boxes;
  const accentClassName = accentClassByMetricLabel[metric.label] ?? "wh-stat-card--products";

  return (
    <UIStatCard
      className={cn("wh-stat-card wh-section-card relative overflow-hidden", accentClassName)}
      label={metric.label}
      value={metric.value}
      description={descriptionByMetricLabel[metric.label]}
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
