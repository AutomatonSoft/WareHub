"use client";

import { useEffect, useMemo, useState } from "react";
import { AnalyticsChart } from "./analytics-chart";
import {
  DashboardKidDto as KidDto,
  DashboardOrderDto as OrderDto,
  fetchDashboardOverviewData
} from "./dashboard-api";
import { LiveKpiGrid } from "./live-kpi-grid";
import { LowStockCard } from "./low-stock-card";
import { QuickActionsCard } from "./quick-actions-card";
import type { KpiMetric } from "../../lib/mock-data";

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

function parsePrice(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyCompact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short" });
}

export function DashboardLiveOverview() {
  const [kids, setKids] = useState<KidDto[]>([]);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const { kids: kidsPayload, orders: ordersPayload } = await fetchDashboardOverviewData();

        if (active) {
          setKids(kidsPayload);
          setOrders(ordersPayload);
        }
      } catch (loadError) {
        console.error("DASHBOARD_OVERVIEW_LOAD_ERROR", loadError);
        if (active) {
          setKids([]);
          setOrders([]);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, []);

  const metrics = useMemo<KpiMetric[]>(() => {
    const totalProducts = kids.length;
    const stockValue = orders.reduce((sum, order) => sum + parsePrice(order.global_price), 0);
    const totalOrders = orders.length;
    const paidOrders = orders.filter((order) => order.status === "paid").length;
    const noPaidOrders = orders.filter((order) => order.status === "no_paid").length;
    const fulfillmentRate = totalOrders === 0 ? 0 : (paidOrders / totalOrders) * 100;

    return [
      {
        label: "Total Products",
        value: new Intl.NumberFormat("en-US").format(totalProducts),
        delta: `${totalProducts} live`,
        trend: "up"
      },
      {
        label: "Stock Value",
        value: formatCurrencyCompact(stockValue),
        delta: `${orders.filter((order) => parsePrice(order.global_price) > 0).length} priced`,
        trend: "up"
      },
      {
        label: "Low Stock Items",
        value: new Intl.NumberFormat("en-US").format(noPaidOrders),
        delta: `${noPaidOrders} no_paid`,
        trend: "down"
      },
      {
        label: "Avg Fulfillment Rate",
        value: `${fulfillmentRate.toFixed(1)}%`,
        delta: `${paidOrders}/${totalOrders} paid`,
        trend: "up"
      }
    ];
  }, [kids.length, orders]);

  const chartData = useMemo<ChartPoint[]>(() => {
    const now = new Date();
    const months: Date[] = [];
    for (let offset = 7; offset >= 0; offset -= 1) {
      months.push(new Date(now.getFullYear(), now.getMonth() - offset, 1));
    }

    const revenueByMonth = new Map<string, number>();
    for (const month of months) {
      const key = monthKey(month);
      revenueByMonth.set(key, 0);
    }

    for (const order of orders) {
      const value = parsePrice(order.global_price);
      if (!order.date) {
        continue;
      }
      const date = new Date(order.date);
      if (Number.isNaN(date.getTime())) {
        continue;
      }
      const key = monthKey(new Date(date.getFullYear(), date.getMonth(), 1));
      if (!revenueByMonth.has(key)) {
        continue;
      }
      revenueByMonth.set(key, (revenueByMonth.get(key) ?? 0) + value);
    }

    return months.map((month) => {
      const key = monthKey(month);
      const paidOrders = orders.filter((order) => {
        if (order.status !== "paid" || !order.date) return false;
        const date = new Date(order.date);
        if (Number.isNaN(date.getTime())) return false;
        return monthKey(new Date(date.getFullYear(), date.getMonth(), 1)) === key;
      });
      const unpaidOrders = orders.filter((order) => {
        if (order.status !== "no_paid" || !order.date) return false;
        const date = new Date(order.date);
        if (Number.isNaN(date.getTime())) return false;
        return monthKey(new Date(date.getFullYear(), date.getMonth(), 1)) === key;
      });
      const paidRevenueRaw = paidOrders.reduce((sum, order) => sum + parsePrice(order.global_price), 0);
      const unpaidRevenueRaw = unpaidOrders.reduce((sum, order) => sum + parsePrice(order.global_price), 0);
      const totalOrders = paidOrders.length + unpaidOrders.length;
      const totalRevenueRaw = paidRevenueRaw + unpaidRevenueRaw;
      const avgCheck = totalOrders > 0 ? totalRevenueRaw / totalOrders : 0;
      const paidShare = totalOrders > 0 ? (paidOrders.length / totalOrders) * 100 : 0;
      return {
        month: monthLabel(month),
        paidRevenue: Math.round(paidRevenueRaw / 100),
        unpaidRevenue: Math.round(unpaidRevenueRaw / 100),
        paidOrders: paidOrders.length,
        unpaidOrders: unpaidOrders.length,
        totalOrders,
        totalRevenue: Math.round(totalRevenueRaw / 100),
        avgCheck: Math.round(avgCheck / 100),
        paidShare: Number(paidShare.toFixed(1))
      };
    });
  }, [orders]);

  const lowStockAlerts = useMemo(() => {
    const rows = orders
      .filter((order) => order.status === "no_paid")
      .sort((a, b) => (a.quantity ?? 0) - (b.quantity ?? 0))
      .map((order, index) => ({
        id: String(order.id ?? `live-${index}`),
        name: order.title?.trim() || "Order item",
        sku: order.sku?.trim() || "-",
        qty: order.quantity ?? 0
      }));
    return {
      visible: rows.slice(0, 3),
      total: rows.length
    };
  }, [orders]);

  return (
    <div className="wh-dashboard">
      <LiveKpiGrid metrics={metrics} loading={loading} error={null} />
      <div className="wh-dashboard__main-grid">
        <AnalyticsChart data={chartData} loading={loading} />
        <div className="wh-dashboard__side-column">
          <LowStockCard alerts={lowStockAlerts.visible} totalAlerts={lowStockAlerts.total} loading={loading} />
          <QuickActionsCard />
        </div>
      </div>
    </div>
  );
}
