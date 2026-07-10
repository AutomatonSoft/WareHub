"use client";

import { useEffect, useMemo, useState } from "react";

import { useLabels, useLanguage } from "../../app/use-labels";
import type { KpiMetric } from "../../lib/mock-data";
import {
  DashboardKidDto as KidDto,
  DashboardOrderDto as OrderDto,
  fetchDashboardOverviewData
} from "./dashboard-api";
import { LiveKpiGrid } from "./live-kpi-grid";

function parsePrice(value?: string | null): number {
  if (!value) {
    return 0;
  }
  const normalized = value.replace(",", ".").replace(/[^\d.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrencyCompact(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "EUR",
    notation: "compact",
    maximumFractionDigits: 2
  }).format(value);
}

export function DashboardLiveOverview() {
  const t = useLabels();
  const lang = useLanguage();
  const [kids, setKids] = useState<KidDto[]>([]);
  const [orders, setOrders] = useState<OrderDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const numberLocale = lang === "ru" ? "ru-RU" : lang === "de" ? "de-DE" : "en-US";

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
  }, [t.unableLoadRecentActivity]);

  const metrics = useMemo<KpiMetric[]>(() => {
    if (error) {
      return [
        { id: "total_products", value: t.notAvailable, delta: t.serviceUnavailable, trend: "down" },
        { id: "stock_value", value: t.notAvailable, delta: t.serviceUnavailable, trend: "down" },
        { id: "low_stock_items", value: t.notAvailable, delta: t.serviceUnavailable, trend: "down" },
        { id: "avg_fulfillment_rate", value: t.notAvailable, delta: t.serviceUnavailable, trend: "down" }
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
        id: "total_products",
        value: new Intl.NumberFormat(numberLocale).format(totalProducts),
        delta: t.activeCount.replace("{count}", String(totalProducts)),
        trend: "up"
      },
      {
        id: "stock_value",
        value: formatCurrencyCompact(stockValue, numberLocale),
        delta: t.pricedCount.replace("{count}", String(pricedOrders)),
        trend: "up"
      },
      {
        id: "low_stock_items",
        value: new Intl.NumberFormat(numberLocale).format(noPaidOrders),
        delta: t.unpaidCount.replace("{count}", String(noPaidOrders)),
        trend: "down"
      },
      {
        id: "avg_fulfillment_rate",
        value: `${fulfillmentRate.toFixed(1)}%`,
        delta: t.fulfilledCount.replace("{paid}", String(paidOrders)).replace("{total}", String(totalOrders)),
        trend: "up"
      }
    ];
  }, [error, kids.length, numberLocale, orders, t]);

  return (
    <div className="wh-dashboard">
      <LiveKpiGrid metrics={metrics} loading={loading} error={error} />
    </div>
  );
}
