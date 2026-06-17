"use client";

import { StatCard } from "./stat-card";
import type { KpiMetric } from "../../lib/mock-data";
import { Card, CardContent, CardHeader } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

function KpiSkeletonCard() {
  return (
    <Card className="wh-stat-card wh-section-card relative overflow-hidden">
      <CardHeader className="pb-3">
        <Skeleton className="h-3 w-24" />
      </CardHeader>
      <CardContent className="pt-0">
        <Skeleton className="mt-3 h-9 w-28" />
        <Skeleton className="mt-3 h-7 w-20 rounded-full" />
      </CardContent>
    </Card>
  );
}

export function LiveKpiGrid({
  metrics,
  loading,
  error
}: {
  metrics?: KpiMetric[];
  loading?: boolean;
  error?: string | null;
}) {
  const displayMetrics = metrics ?? [];

  return (
    <div>
      <div className="wh-dashboard__stats wh-stat-grid stagger-children">
        {loading
          ? Array.from({ length: 4 }).map((_, index) => <KpiSkeletonCard key={`kpi-skeleton-${index}`} />)
          : displayMetrics.map((metric) => <StatCard key={metric.label} metric={metric} />)}
      </div>
      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

