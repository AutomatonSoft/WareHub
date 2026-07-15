"use client";

import { StatCard } from "./stat-card";
import type { KpiMetric } from "../../lib/mock-data";
import { Card, CardAction, CardContent, CardHeader } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

function KpiSkeletonCard() {
  return (
    <Card className="wh-stat-card wh-section-card relative overflow-hidden">
      <CardHeader>
        <Skeleton className="h-3 w-24" />
        <CardAction>
          <Skeleton className="size-6 rounded-[var(--radius-control)]" />
        </CardAction>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="min-w-0">
          <Skeleton className="h-8 w-24" />
        </div>
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
          ? Array.from({ length: 3 }).map((_, index) => <KpiSkeletonCard key={`kpi-skeleton-${index}`} />)
          : displayMetrics.map((metric) => <StatCard key={metric.id} metric={metric} />)}
      </div>
      {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

