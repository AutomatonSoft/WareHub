"use client";

import { RadioTower } from "lucide-react";
import { useEffect, useState } from "react";
import {
  allMarketplaceSites,
  STATUS_CACHE_KEY,
  type SiteConnectionStatus
} from "../../lib/marketplace-sites";
import { Badge } from "../ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Skeleton } from "../ui/skeleton";

type CachedSiteStatus = {
  status: SiteConnectionStatus;
  lastSync: string;
};

const statusOrder: Record<SiteConnectionStatus, number> = {
  CONNECTED: 2,
  DISCONNECTED: 1,
  NOT_FOUND: 0
};

function readStatusCache(): Record<string, CachedSiteStatus> {
  if (typeof window === "undefined") {
    return {};
  }
  try {
    const raw = window.localStorage.getItem(STATUS_CACHE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as Record<string, CachedSiteStatus>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function statusLabel(status: SiteConnectionStatus): string {
  if (status === "CONNECTED") return "Connected";
  if (status === "NOT_FOUND") return "Not configured";
  return "Connection failed";
}

function statusHint(status: SiteConnectionStatus): string {
  if (status === "CONNECTED") return "Credentials valid and sync available.";
  if (status === "NOT_FOUND") return "Missing credentials or marketplace mapping.";
  return "Connection check failed or service unavailable.";
}

function toneClass(status: SiteConnectionStatus): string {
  if (status === "CONNECTED") return "ui-status-success";
  if (status === "NOT_FOUND") return "ui-status-warning";
  return "ui-status-danger";
}

export function SyncStatusCard() {
  const [cacheVersion, setCacheVersion] = useState(0);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
    const onStorage = (event: StorageEvent) => {
      if (event.key === STATUS_CACHE_KEY) {
        setCacheVersion((v) => v + 1);
      }
    };
    window.addEventListener("storage", onStorage);
    const timer = window.setInterval(() => setCacheVersion((v) => v + 1), 10_000);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.clearInterval(timer);
    };
  }, []);

  const rows = (() => {
    const cache = readStatusCache();
    const mappedRows = allMarketplaceSites
      .map((site) => {
        const cached = cache[site.id];
        const status = cached?.status ?? "NOT_FOUND";
        return {
          id: site.id,
          name: site.name,
          status,
          lastSync: cached?.lastSync ?? null
        };
      })
      .sort((left, right) => {
        const byStatus = statusOrder[right.status] - statusOrder[left.status];
        if (byStatus !== 0) return byStatus;
        return left.name.localeCompare(right.name);
      });

    return {
      rows: mappedRows,
      connectedCount: mappedRows.filter((row) => row.status === "CONNECTED").length,
      notConnectedCount: mappedRows.filter((row) => row.status !== "CONNECTED").length
    };
  })();

  if (!hydrated) {
    return (
      <Card className="wh-section-card wh-dashboard__sync-card min-w-0">
        <CardHeader className="wh-section-card__header">
          <CardTitle className="title-with-icon wh-section-card__title">
            <span className="title-icon-chip"><RadioTower size={14} /></span>
            Marketplace Sync Status
          </CardTitle>
        </CardHeader>
        <CardContent className="wh-section-card__body wh-section-card__body--scroll">
          <div className="wh-sync-list">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`sync-skeleton-${index}`} className="wh-sync-row">
                <div className="flex items-center justify-between">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-4 w-20" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
      <Card className="wh-section-card wh-dashboard__sync-card min-w-0">
      <CardHeader className="wh-section-card__header">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <CardTitle className="title-with-icon wh-section-card__title">
            <span className="title-icon-chip"><RadioTower size={14} /></span>
            Marketplace Sync Status
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="success">Connected: {rows.connectedCount}</Badge>
            <Badge variant="warning">Not connected: {rows.notConnectedCount}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="wh-section-card__body">
        <div className="wh-sync-list wh-sync-list--with-footer scrollbar-thin">
          {rows.rows.map((sync) => (
            <div key={sync.id} className="wh-sync-row wh-list-row">
              <div className="flex min-h-[28px] items-center justify-between gap-3">
                <p className="wh-sync-row__title wh-list-row__title">{sync.name}</p>
                <div className={`inline-flex items-center gap-2 text-xs ${toneClass(sync.status)}`}>
                  <span className="ui-status-dot" />
                  {statusLabel(sync.status)}
                </div>
              </div>
              <p className="wh-sync-row__meta wh-list-row__meta">
                {sync.lastSync ? `Last check: ${sync.lastSync}` : statusHint(sync.status)}
              </p>
            </div>
          ))}
        </div>
        <div className="wh-card-footer">
          <p className="wh-card-footer__text">
            {rows.connectedCount} connected, {rows.notConnectedCount} not connected
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
