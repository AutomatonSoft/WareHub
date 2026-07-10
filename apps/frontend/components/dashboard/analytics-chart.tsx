"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  XAxis,
  YAxis
} from "recharts";
import { Activity } from "lucide-react";

import { useLabels } from "../../app/use-labels";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";

type ChartPoint = {
  month: string;
  paidRevenue: number;
  unpaidRevenue: number;
  paidOrders: number;
  unpaidOrders: number;
  totalOrders: number;
  totalRevenue: number;
  avgCheck: number;
  paidShare: number;
};

type InsightMode =
  | "paid_vs_unpaid_revenue"
  | "paid_vs_unpaid_orders"
  | "total_orders"
  | "avg_check"
  | "paid_share";

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
  const [mode, setMode] = useState<InsightMode>("paid_vs_unpaid_revenue");
  const modeMeta = useMemo<Record<InsightMode, { title: string; subtitle: string }>>(
    () => ({
      paid_vs_unpaid_revenue: {
        title: t.paidVsUnpaidRevenue,
        subtitle: t.whereMoneyComesFromEachMonth
      },
      paid_vs_unpaid_orders: {
        title: t.paidVsUnpaidOrders,
        subtitle: t.orderVolumeAndPaymentState
      },
      total_orders: {
        title: t.totalOrdersTrend,
        subtitle: t.monthlyOrderCountDynamics
      },
      avg_check: {
        title: t.averageCheck,
        subtitle: t.averageRevenuePerOrder
      },
      paid_share: {
        title: t.paidOrdersShare,
        subtitle: t.paymentConversionQuality
      }
    }),
    [t]
  )[mode];
  const hasData = chartData.length > 0;
  const hasSignal = useMemo(
    () =>
      chartData.some(
        (point) =>
          point.paidRevenue > 0 ||
          point.unpaidRevenue > 0 ||
          point.paidOrders > 0 ||
          point.unpaidOrders > 0 ||
          point.totalOrders > 0
      ),
    [chartData]
  );

  const yAxisFormatter = useMemo(() => {
    if (mode === "paid_share") return (value: number) => `${value}%`;
    return (value: number) => value.toLocaleString("en-US");
  }, [mode]);

  const summary = useMemo(() => {
    const paidRevenue = chartData.reduce((sum, point) => sum + point.paidRevenue, 0);
    const unpaidRevenue = chartData.reduce((sum, point) => sum + point.unpaidRevenue, 0);
    return {
      paidRevenue: paidRevenue.toLocaleString("en-US"),
      unpaidRevenue: unpaidRevenue.toLocaleString("en-US"),
      months: chartData.length
    };
  }, [chartData]);

  const emptyStateItems = useMemo(
    () => [
      { label: t.paidRevenueLabel, value: summary.paidRevenue },
      { label: t.unpaidRevenueLabel, value: summary.unpaidRevenue },
      { label: t.monthsTracked, value: String(summary.months) }
    ],
    [summary, t]
  );

  return (
    <Card className="wh-section-card wh-dashboard__revenue-card min-w-0">
      <CardHeader className="wh-section-card__header">
        <div className="min-w-0">
          <CardTitle className="title-with-icon wh-section-card__title">
            <span className="title-icon-chip"><Activity aria-hidden="true" size={14} /></span>
            {t.revenueAcrossMarketplaces}
          </CardTitle>
          <CardDescription className="wh-section-card__subtitle">{modeMeta.subtitle}</CardDescription>
        </div>
        <CardAction className="wh-section-card__actions">
          <Select value={mode} onValueChange={(value) => setMode(value as InsightMode)}>
            <SelectTrigger aria-label={t.insightMode} className="wh-select min-w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="paid_vs_unpaid_revenue">{t.paidVsUnpaidRevenue}</SelectItem>
                <SelectItem value="paid_vs_unpaid_orders">{t.paidVsUnpaidOrders}</SelectItem>
                <SelectItem value="total_orders">{t.totalOrdersTrend}</SelectItem>
                <SelectItem value="avg_check">{t.averageCheck}</SelectItem>
                <SelectItem value="paid_share">{t.paidSharePercent}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent className="wh-section-card__body">
        {!loading && hasData && hasSignal ? (
          <div className="wh-chart-summary">
            <div className="wh-chart-summary__item">
              <span className="wh-chart-summary__label">{t.paidRevenueLabel}</span>
              <span className="wh-chart-summary__value">{summary.paidRevenue}</span>
            </div>
            <div className="wh-chart-summary__item">
              <span className="wh-chart-summary__label">{t.unpaidRevenueLabel}</span>
              <span className="wh-chart-summary__value">{summary.unpaidRevenue}</span>
            </div>
            <div className="wh-chart-summary__item">
              <span className="wh-chart-summary__label">{t.monthsTracked}</span>
              <span className="wh-chart-summary__value">{summary.months}</span>
            </div>
          </div>
        ) : null}
        <div className="mb-3 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-semibold">{modeMeta.title}</span>
        </div>
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
                <p className="text-sm font-medium text-foreground">{t.noRevenueDataYet}</p>
                <p className="max-w-md text-xs text-muted-foreground">{t.revenueWillAppearAfterImport}</p>
              </div>
            </div>
          ) : (
            <ChartContainer
              config={{
                paidRevenue: { label: t.paidRevenueLabel, color: "var(--chart-4)" },
                unpaidRevenue: { label: t.unpaidRevenueLabel, color: "var(--chart-3)" },
                paidOrders: { label: t.paidOrders, color: "var(--chart-2)" },
                unpaidOrders: { label: t.unpaidOrders, color: "var(--chart-5)" },
                totalOrders: { label: t.totalOrdersLabel, color: "var(--chart-4)" },
                avgCheck: { label: t.averageCheck, color: "var(--chart-4)" },
                paidShare: { label: t.paidShare, color: "var(--chart-2)" }
              }}
              className="h-full w-full"
            >
              <ComposedChart data={chartData} margin={{ left: 8, right: 8, top: 10, bottom: 14 }}>
                <defs>
                  <linearGradient id="paidArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary-container)" stopOpacity={0.65} />
                    <stop offset="100%" stopColor="var(--primary-container)" stopOpacity={0.06} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--border) 54%, transparent)" />
                <XAxis dataKey="month" stroke="var(--text-muted)" axisLine={false} tickLine={false} tickMargin={8} />
                <YAxis
                  stroke="var(--text-muted)"
                  axisLine={false}
                  tickLine={false}
                  width={44}
                  tickMargin={8}
                  allowDecimals={false}
                  tickFormatter={yAxisFormatter}
                  domain={mode === "paid_share" ? [0, 100] : undefined}
                />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => `${t.monthLabel}: ${String(label ?? "")}`} />} />

                {mode === "paid_vs_unpaid_revenue" ? (
                  <>
                    <Bar dataKey="paidRevenue" name={t.paidRevenueLabel} fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="unpaidRevenue" name={t.unpaidRevenueLabel} fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                  </>
                ) : null}

                {mode === "paid_vs_unpaid_orders" ? (
                  <>
                    <Bar dataKey="paidOrders" name={t.paidOrders} fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="unpaidOrders" name={t.unpaidOrders} fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
                  </>
                ) : null}

                {mode === "total_orders" ? (
                  <>
                    <Area type="monotone" dataKey="totalOrders" name={t.totalOrdersLabel} stroke="var(--chart-4)" fill="url(#paidArea)" strokeWidth={2.4} />
                    <Line type="monotone" dataKey="paidOrders" name={t.paidOrders} stroke="var(--chart-2)" strokeWidth={1.8} dot={false} />
                  </>
                ) : null}

                {mode === "avg_check" ? (
                  <>
                    <Line type="monotone" dataKey="avgCheck" name={t.averageCheck} stroke="var(--chart-4)" strokeWidth={2.6} />
                    <Bar dataKey="totalRevenue" name={t.totalRevenue} fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                  </>
                ) : null}

                {mode === "paid_share" ? (
                  <>
                    <Area type="monotone" dataKey="paidShare" name={t.paidSharePercent} stroke="var(--chart-2)" fill="color-mix(in srgb, var(--chart-2) 24%, transparent)" strokeWidth={2.4} />
                    <Line type="monotone" dataKey="paidShare" name={t.paidShareTrend} stroke="var(--chart-2)" strokeWidth={1.6} dot={false} />
                  </>
                ) : null}
              </ComposedChart>
            </ChartContainer>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
