"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DashboardKidDto as KidDto,
  DashboardOrderDto as OrderDto,
  fetchDashboardOverviewData
} from "./dashboard-api";
import { LiveKpiGrid } from "./live-kpi-grid";
import type { KpiMetric } from "../../lib/mock-data";

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

export function DashboardLiveOverview() {
  const [kids, setKids] = useState<KidDto[]>([]);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
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
          setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data right now.");
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
    if (error) {
      return [
        { label: "Total Products", value: "N/A", delta: "Service unavailable", trend: "down" },
        { label: "Stock Value", value: "N/A", delta: "Service unavailable", trend: "down" },
        { label: "Low Stock Items", value: "N/A", delta: "Service unavailable", trend: "down" },
        { label: "Avg Fulfillment Rate", value: "N/A", delta: "Service unavailable", trend: "down" }
      ];
    }

    const totalProducts = kids.length;
    const stockValue = orders.reduce((sum, order) => sum + parsePrice(order.global_price), 0);
    const totalOrders = orders.length;
    const paidOrders = orders.filter((order) => order.status === "paid").length;
    const noPaidOrders = orders.filter((order) => order.status === "no_paid").length;
    const pricedOrders = orders.filter((order) => parsePrice(order.global_price) > 0).length;
    const fulfillmentRate = totalOrders === 0 ? 0 : (paidOrders / totalOrders) * 100;

    return [
      {
        label: "Total Products",
        value: new Intl.NumberFormat("en-US").format(totalProducts),
        delta: `${totalProducts} active`,
        trend: "up"
      },
      {
        label: "Stock Value",
        value: formatCurrencyCompact(stockValue),
        delta: `${pricedOrders} priced`,
        trend: "up"
      },
      {
        label: "Low Stock Items",
        value: new Intl.NumberFormat("en-US").format(noPaidOrders),
        delta: `${noPaidOrders} unpaid`,
        trend: "down"
      },
      {
        label: "Avg Fulfillment Rate",
        value: `${fulfillmentRate.toFixed(1)}%`,
        delta: `${paidOrders}/${totalOrders} fulfilled`,
        trend: "up"
      }
    ];
  }, [error, kids.length, orders]);

  return (
    <div className="wh-dashboard">
      <LiveKpiGrid metrics={metrics} loading={loading} error={error} />
    </div>
  );
}
