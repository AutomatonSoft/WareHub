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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
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

const INSIGHT_LABELS: Record<InsightMode, { title: string; subtitle: string }> = {
  paid_vs_unpaid_revenue: {
    title: "Paid vs unpaid revenue",
    subtitle: "Where money comes from each month"
  },
  paid_vs_unpaid_orders: {
    title: "Paid vs unpaid orders",
    subtitle: "Order volume and payment state"
  },
  total_orders: {
    title: "Total orders trend",
    subtitle: "Monthly order count dynamics"
  },
  avg_check: {
    title: "Average check",
    subtitle: "Average revenue per order"
  },
  paid_share: {
    title: "Paid orders share (%)",
    subtitle: "Payment conversion quality"
  }
};

export function AnalyticsChart({
  data,
  loading
}: {
  data?: ChartPoint[];
  loading?: boolean;
}) {
  const chartData = useMemo(() => data ?? [], [data]);
  const [mode, setMode] = useState<InsightMode>("paid_vs_unpaid_revenue");
  const modeMeta = INSIGHT_LABELS[mode];
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

  return (
    <Card className="wh-section-card wh-dashboard__revenue-card min-w-0">
      <CardHeader className="wh-section-card__header">
        <div className="wh-section-card__title-group">
          <CardTitle className="title-with-icon wh-section-card__title">
            <span className="title-icon-chip"><Activity size={14} /></span>
            Revenue Across Marketplaces
          </CardTitle>
          <CardDescription className="wh-section-card__subtitle">{modeMeta.subtitle}</CardDescription>
        </div>
        <div className="wh-section-card__actions">
          <Select value={mode} onValueChange={(value) => setMode(value as InsightMode)}>
            <SelectTrigger aria-label="Insight mode" className="wh-select min-w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="paid_vs_unpaid_revenue">1. Paid vs unpaid revenue</SelectItem>
              <SelectItem value="paid_vs_unpaid_orders">2. Paid vs unpaid orders</SelectItem>
              <SelectItem value="total_orders">3. Total orders</SelectItem>
              <SelectItem value="avg_check">4. Average check</SelectItem>
              <SelectItem value="paid_share">5. Paid share (%)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="wh-section-card__body">
        {!loading && hasData && hasSignal ? (
          <div className="wh-chart-summary">
            <div className="wh-chart-summary__item">
              <span className="wh-chart-summary__label">Paid revenue</span>
              <span className="wh-chart-summary__value">{summary.paidRevenue}</span>
            </div>
            <div className="wh-chart-summary__item">
              <span className="wh-chart-summary__label">Unpaid revenue</span>
              <span className="wh-chart-summary__value">{summary.unpaidRevenue}</span>
            </div>
            <div className="wh-chart-summary__item">
              <span className="wh-chart-summary__label">Months</span>
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
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={`chart-line-${index}`} className="h-3 w-full" />
              ))}
              <div className="mt-3 flex items-end justify-between">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Skeleton key={`chart-tick-${index}`} className="h-2 w-8" />
                ))}
              </div>
            </div>
          </div>
        ) : !hasData || !hasSignal ? (
          <div className="wh-empty-state wh-empty-state--dashboard flex h-full flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-foreground">No revenue data yet</p>
            <p className="max-w-md text-xs text-muted-foreground">Revenue will appear after paid marketplace orders are imported.</p>
          </div>
        ) : (
          <ChartContainer
            config={{
              paidRevenue: { label: "Paid revenue", color: "var(--chart-4)" },
              unpaidRevenue: { label: "Unpaid revenue", color: "var(--chart-3)" },
              paidOrders: { label: "Paid orders", color: "var(--chart-2)" },
              unpaidOrders: { label: "Unpaid orders", color: "var(--chart-5)" },
              totalOrders: { label: "Total orders", color: "var(--chart-4)" },
              avgCheck: { label: "Average check", color: "var(--chart-4)" },
              paidShare: { label: "Paid share", color: "var(--chart-2)" }
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
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => `Month: ${String(label ?? "")}`} />} />

              {mode === "paid_vs_unpaid_revenue" ? (
                <>
                  <Bar dataKey="paidRevenue" name="Paid revenue" fill="var(--chart-4)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="unpaidRevenue" name="Unpaid revenue" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
                </>
              ) : null}

              {mode === "paid_vs_unpaid_orders" ? (
                <>
                  <Bar dataKey="paidOrders" name="Paid orders" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="unpaidOrders" name="Unpaid orders" fill="var(--chart-5)" radius={[6, 6, 0, 0]} />
                </>
              ) : null}

              {mode === "total_orders" ? (
                <>
                  <Area type="monotone" dataKey="totalOrders" name="Total orders" stroke="var(--chart-4)" fill="url(#paidArea)" strokeWidth={2.4} />
                  <Line type="monotone" dataKey="paidOrders" name="Paid orders" stroke="var(--chart-2)" strokeWidth={1.8} dot={false} />
                </>
              ) : null}

              {mode === "avg_check" ? (
                <>
                  <Line type="monotone" dataKey="avgCheck" name="Average check" stroke="var(--chart-4)" strokeWidth={2.6} />
                  <Bar dataKey="totalRevenue" name="Total revenue" fill="var(--chart-1)" radius={[6, 6, 0, 0]} />
                </>
              ) : null}

              {mode === "paid_share" ? (
                <>
                  <Area type="monotone" dataKey="paidShare" name="Paid share %" stroke="var(--chart-2)" fill="color-mix(in srgb, var(--chart-2) 24%, transparent)" strokeWidth={2.4} />
                  <Line type="monotone" dataKey="paidShare" name="Paid share trend" stroke="var(--chart-2)" strokeWidth={1.6} dot={false} />
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

