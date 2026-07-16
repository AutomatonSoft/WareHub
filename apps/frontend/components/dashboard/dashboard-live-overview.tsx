"use client";

import { useEffect, useMemo, useState } from "react";

import { useLabels, useLanguage } from "../../app/use-labels";
import type { KpiMetric } from "../../lib/mock-data";
import { DashboardOrderDto as OrderDto, DashboardWarehouseSummaryDto, fetchDashboardOverviewData } from "./dashboard-api";
import { CriticalInventoryPanel } from "./critical-inventory-panel";
import { LiveKpiGrid } from "./live-kpi-grid";
import { MarketplacePublicationSummary } from "./marketplace-publication-summary";
import { InventoryChangeHistory } from "./inventory-change-history";

function parsePrice(value?: string | null): number {
  if (!value) return 0;
  const raw = value.replace(/[^\d,.-]/g, "");
  const lastComma = raw.lastIndexOf(",");
  const lastDot = raw.lastIndexOf(".");
  const normalized = lastComma > lastDot ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getPaidRevenueAmount(order: OrderDto): number | null {
  if (order.status !== "paid") return null;
  const amount = parsePrice(order.full_amount);
  return amount > 0 ? amount : null;
}

export function DashboardLiveOverview() {
  const t = useLabels();
  const lang = useLanguage();
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [summary, setSummary] = useState<DashboardWarehouseSummaryDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const numberLocale = lang === "ru" ? "ru-RU" : lang === "de" ? "de-DE" : "en-US";

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const { orders: ordersPayload, summary: summaryPayload } = await fetchDashboardOverviewData();

        if (active) {
          setOrders(ordersPayload);
          setSummary(summaryPayload);
        }
      } catch (loadError) {
        console.error("DASHBOARD_OVERVIEW_LOAD_ERROR", loadError);
        if (active) {
          setOrders([]);
          setSummary(null);
          const message =
            loadError instanceof Error && loadError.message === "dashboard_overview_request_failed"
              ? t.dashboardOverviewRequestFailed
              : loadError instanceof Error
                ? loadError.message
                : t.unableLoadRecentActivity;
          setError(message);
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
  }, [t.dashboardOverviewRequestFailed, t.unableLoadRecentActivity]);

  const metrics = useMemo<KpiMetric[]>(() => {
    if (error) {
      return [
        { id: "total_products", value: t.notAvailable, delta: t.serviceUnavailable, trend: "down" },
        { id: "avg_fulfillment_rate", value: t.notAvailable, delta: t.serviceUnavailable, trend: "down" },
        { id: "in_transit_products", value: t.notAvailable, delta: t.serviceUnavailable, trend: "down" },
        { id: "b_ware_products", value: t.notAvailable, delta: t.serviceUnavailable, trend: "down" }
      ];
    }

    if (!summary) {
      return [];
    }

    const paidRevenue = orders.reduce((total, order) => total + (getPaidRevenueAmount(order) ?? 0), 0);

    return [
      {
        id: "total_products",
        value: new Intl.NumberFormat(numberLocale).format(summary.total_products),
        delta: t.warehouseCatalogFootprint,
        trend: "up"
      },
      {
        id: "avg_fulfillment_rate",
        value: new Intl.NumberFormat(numberLocale, {
          style: "currency",
          currency: "EUR",
          maximumFractionDigits: 0
        }).format(paidRevenue),
        delta: t.allTimePaidRevenue,
        trend: "up"
      },
      {
        id: "in_transit_products",
        value: new Intl.NumberFormat(numberLocale).format(summary.in_transit_products),
        delta: t.inTransitProductsDescription,
        trend: "up"
      },
      {
        id: "b_ware_products",
        value: new Intl.NumberFormat(numberLocale).format(summary.b_ware_products),
        delta: t.bWareProductsDescription,
        trend: "up"
      }
    ];
  }, [error, numberLocale, orders, summary, t]);

  return (
    <div className="wh-dashboard">
      <LiveKpiGrid metrics={metrics} loading={loading} error={error} />
      <MarketplacePublicationSummary statuses={summary?.marketplace_statuses} loading={loading} />
      <div className="wh-dashboard__main-grid">
        <div className="wh-dashboard__main-grid-left">
          <CriticalInventoryPanel />
        </div>
        <InventoryChangeHistory />
      </div>
    </div>
  );
}
