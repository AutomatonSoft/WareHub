"use client";

import { BarChart3, PieChart as PieChartIcon, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "../ui/chart";
import { Skeleton } from "../ui/skeleton";

type StatusPoint = {
  name: string;
  value: number;
};

type RevenuePoint = {
  name: string;
  value: number;
};

type AvgPoint = {
  month: string;
  avg: number;
};

type MixedChartsPanelProps = {
  loading?: boolean;
  statusData: StatusPoint[];
  revenueSplitData: RevenuePoint[];
  avgOrderData: AvgPoint[];
};

const PIE_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-border bg-muted/30 text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function ChartShell({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card className="min-w-0 rounded-xl border-border bg-card shadow-sm">
      <CardHeader className="pb-3">
      <div className="flex items-center gap-2">
        <span className="title-icon-chip !h-7 !w-7">{icon}</span>
        <CardTitle className="text-base">{title}</CardTitle>
      </div>
      </CardHeader>
      <CardContent>
        <div className="h-[220px]">{children}</div>
      </CardContent>
    </Card>
  );
}

export function MixedChartsPanel({
  loading,
  statusData,
  revenueSplitData,
  avgOrderData
}: MixedChartsPanelProps) {
  return (
    <div className="dashboard-grid grid gap-4 xl:grid-cols-3">
      <ChartShell title="Orders by Status" icon={<BarChart3 size={14} />}>
        {loading ? (
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            {Array.from({ length: 5 }).map((_, index) => (
              <Skeleton key={`status-skeleton-${index}`} className="h-5 w-full" />
            ))}
          </div>
        ) : statusData.length === 0 ? (
          <EmptyChartState message="No status data yet" />
        ) : (
          <ChartContainer config={{ value: { label: "Orders", color: "var(--chart-4)" } }} className="h-full w-full">
            <BarChart data={statusData} margin={{ left: 0, right: 8, top: 6, bottom: 6 }}>
              <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--border) 82%, transparent)" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tickMargin={8} stroke="var(--text-muted)" />
              <YAxis axisLine={false} tickLine={false} width={36} stroke="var(--text-muted)" allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="value" radius={[8, 8, 0, 0]} fill="var(--chart-4)" />
            </BarChart>
          </ChartContainer>
        )}
      </ChartShell>

      <ChartShell title="Revenue Split" icon={<PieChartIcon size={14} />}>
        {loading ? (
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            <Skeleton className="mx-auto h-36 w-36 rounded-full" />
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        ) : revenueSplitData.length === 0 ? (
          <EmptyChartState message="No revenue data yet" />
        ) : (
          <ChartContainer config={{ value: { label: "Revenue", color: "var(--chart-2)" } }} className="h-full w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={revenueSplitData} dataKey="value" nameKey="name" innerRadius={52} outerRadius={82} paddingAngle={2}>
                {revenueSplitData.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ChartContainer>
        )}
      </ChartShell>

      <ChartShell title="Average Order Value" icon={<TrendingUp size={14} />}>
        {loading ? (
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={`aov-skeleton-${index}`} className="h-4 w-full" />
            ))}
          </div>
        ) : avgOrderData.length === 0 ? (
          <EmptyChartState message="No average value data yet" />
        ) : (
          <ChartContainer config={{ avg: { label: "Avg value", color: "var(--chart-2)" } }} className="h-full w-full">
            <LineChart data={avgOrderData} margin={{ left: 0, right: 8, top: 6, bottom: 6 }}>
              <CartesianGrid vertical={false} stroke="color-mix(in srgb, var(--border) 82%, transparent)" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tickMargin={8} stroke="var(--text-muted)" />
              <YAxis axisLine={false} tickLine={false} width={36} stroke="var(--text-muted)" allowDecimals={false} />
              <ChartTooltip content={<ChartTooltipContent labelFormatter={(label) => `Month: ${String(label ?? "")}`} />} />
              <Line type="monotone" dataKey="avg" stroke="var(--chart-2)" strokeWidth={2.5} dot={false} />
            </LineChart>
          </ChartContainer>
        )}
      </ChartShell>
    </div>
  );
}
