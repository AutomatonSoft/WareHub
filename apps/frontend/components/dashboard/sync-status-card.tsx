"use client";

import { RadioTower } from "lucide-react";
import { useEffect, useState } from "react";
import { useLabels } from "../../app/use-labels";
import {
  allMarketplaceSites,
  STATUS_CACHE_KEY,
  type SiteConnectionStatus
} from "../../lib/marketplace-sites";
import { Badge } from "../ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
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

function statusHint(status: SiteConnectionStatus, t: Record<string, string>): string {
  if (status === "CONNECTED") return t.syncStatusConnectedHint;
  if (status === "NOT_FOUND") return t.syncStatusNotConfiguredHint;
  return t.syncStatusConnectionFailedHint;
}

function toneClass(status: SiteConnectionStatus): string {
  if (status === "CONNECTED") return "ui-status-success";
  if (status === "NOT_FOUND") return "ui-status-warning";
  return "ui-status-danger";
}

function badgeVariant(status: SiteConnectionStatus): "success" | "warning" | "secondary" {
  if (status === "CONNECTED") return "success";
  if (status === "NOT_FOUND") return "warning";
  return "secondary";
}

export function SyncStatusCard() {
  const t = useLabels();
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
          <div className="min-w-0">
            <CardTitle className="title-with-icon wh-section-card__title">
              <span className="title-icon-chip"><RadioTower aria-hidden="true" size={14} /></span>
              {t.syncStatusCardTitle}
            </CardTitle>
            <CardDescription className="wh-section-card__subtitle">{t.syncStatusCardDescription}</CardDescription>
          </div>
        </CardHeader>
        <CardContent className="wh-section-card__body wh-section-card__body--scroll">
          <div className="wh-sync-list">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`sync-skeleton-${index}`} className="wh-sync-row">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-3 w-40" />
                  </div>
                  <Skeleton className="h-6 w-20 rounded-full" />
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
        <div className="min-w-0">
          <CardTitle className="title-with-icon wh-section-card__title">
            <span className="title-icon-chip"><RadioTower aria-hidden="true" size={14} /></span>
            {t.syncStatusCardTitle}
          </CardTitle>
          <CardDescription className="wh-section-card__subtitle">{t.syncStatusCardDescription}</CardDescription>
        </div>
        <CardAction>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <Badge variant="success">{t.syncStatusConnectedCount.replace("{count}", String(rows.connectedCount))}</Badge>
            <Badge variant="warning">{t.syncStatusNotConnectedCount.replace("{count}", String(rows.notConnectedCount))}</Badge>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="wh-section-card__body">
        <div className="wh-sync-list wh-sync-list--with-footer scrollbar-thin">
          {rows.rows.map((sync) => (
            <div key={sync.id} className="wh-sync-row wh-list-row">
              <div className="flex min-h-[24px] items-center justify-between gap-3">
                <p className="wh-sync-row__title wh-list-row__title">{sync.name}</p>
                <Badge variant={badgeVariant(sync.status)} className={toneClass(sync.status)}>
                  {sync.status === "CONNECTED"
                    ? t.syncStatusConnectedLabel
                    : sync.status === "NOT_FOUND"
                      ? t.syncStatusNotConfiguredLabel
                      : t.syncStatusConnectionFailedLabel}
                </Badge>
              </div>
              <p className="wh-sync-row__meta wh-list-row__meta">
                {sync.lastSync ? t.syncStatusLastCheck.replace("{time}", sync.lastSync) : statusHint(sync.status, t)}
              </p>
            </div>
          ))}
        </div>
        <div className="wh-card-footer">
          <p className="wh-card-footer__text">
            {t.syncStatusFooterSummary
              .replace("{connected}", String(rows.connectedCount))
              .replace("{notConnected}", String(rows.notConnectedCount))}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
