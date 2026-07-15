"use client";

import { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  XAxis,
  YAxis
} from "recharts";

import { useLabels } from "../../app/use-labels";
import { Card, CardContent } from "../ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart";
import { Skeleton } from "../ui/skeleton";

type ChartPoint = {
  month: string;
  productCount: number;
};

export function AnalyticsChart({
  data,
  loading,
  error
}: {
  data?: ChartPoint[];
  loading?: boolean;
  error?: string | null;
}) {
  const t = useLabels();
  const chartData = useMemo(() => data ?? [], [data]);
  const hasData = chartData.length > 0;
  const hasSignal = useMemo(() => chartData.some((point) => point.productCount > 0), [chartData]);

  const summary = useMemo(() => {
    const productCount = chartData.reduce((sum, point) => sum + point.productCount, 0);
    return {
      productCount: productCount.toLocaleString("en-US"),
      months: chartData.length
    };
  }, [chartData]);

  const emptyStateItems = useMemo(
    () => [
      { label: t.productsRecorded, value: summary.productCount },
      { label: t.monthsTracked, value: String(summary.months) }
    ],
    [summary, t]
  );

  return (
    <Card className="wh-section-card wh-dashboard__revenue-card min-w-0">
      <CardContent className="wh-section-card__body">
        <div className="wh-chart-shell">
          {loading ? (
            <div className="wh-empty-state wh-empty-state--dashboard h-full">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-2">
                  {Array.from({ length: 3 }).map((_, index) => (
                    <Skeleton key={`chart-summary-${index}`} className="h-14 rounded-xl" />
                  ))}
                </div>
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, index) => (
                    <Skeleton key={`chart-line-${index}`} className="h-3 w-full" />
                  ))}
                </div>
                <div className="mt-3 flex items-end justify-between">
                  {Array.from({ length: 8 }).map((_, index) => (
                    <Skeleton key={`chart-tick-${index}`} className="h-2 w-8" />
                  ))}
                </div>
              </div>
            </div>
          ) : error ? (
            <div className="wh-empty-state wh-empty-state--dashboard wh-dashboard-empty-state flex h-full flex-col items-center justify-center gap-2 text-center">
              <p className="text-sm font-medium text-foreground">{t.overviewDataUnavailable}</p>
              <p className="max-w-md text-xs text-muted-foreground">{error}</p>
            </div>
          ) : !hasData || !hasSignal ? (
            <div className="wh-empty-state wh-empty-state--dashboard wh-chart-empty-state flex h-full flex-col justify-center">
              <div className="wh-chart-summary">
                {emptyStateItems.map((item) => (
                  <div key={item.label} className="wh-chart-summary__item">
                    <span className="wh-chart-summary__label">{item.label}</span>
                    <span className="wh-chart-summary__value">{item.value}</span>
                  </div>
                ))}
              </div>
              <div className="wh-chart-empty-state__copy">
                <p className="text-sm font-medium text-foreground">{t.noProductsDataYet}</p>
                <p className="max-w-md text-xs text-muted-foreground">{t.productsWillAppearAfterImport}</p>
              </div>
            </div>
          ) : (
            <ChartContainer
              config={{ productCount: { label: t.productsRecorded, color: "var(--chart-4)" } }}
              className="h-full w-full"
            >
              <ComposedChart data={chartData} margin={{ left: 8, right: 8, top: 10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--border) 54%, transparent)" />
                <XAxis dataKey="month" stroke="var(--text-muted)" axisLine={false} tickLine={false} tickMargin={8} height={32} padding={{ left: 10, right: 10 }} />
                <YAxis
                  stroke="var(--text-muted)"
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickMargin={8}
                  allowDecimals={false}
                  tickFormatter={(value: number) => value.toLocaleString("en-US")}
                />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => `${t.monthLabel}: ${String(label ?? "")}`} />} />
                <Bar dataKey="productCount" name={t.productsRecorded} fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
              </ComposedChart>
            </ChartContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
