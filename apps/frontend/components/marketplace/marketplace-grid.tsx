"use client";

import { RefreshCcw, Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useLabels } from "../../app/use-labels";
import { trackLatency, trackUiError, trackUiEvent } from "../../app/telemetry";
import {
  allMarketplaceSites,
  STATUS_CACHE_KEY,
  type MarketplaceSite,
  type SiteConnectionStatus,
  type SiteFamily,
  type SiteKind
} from "../../lib/marketplace-sites";
import { checkDatabaseAccess, fetchMarketplaceHealth } from "./marketplace-api";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Skeleton } from "../ui/skeleton";
import { FilterPresets } from "../shared/table/filter-presets";

const logoByFamily: Record<SiteFamily, string> = {
  OTTO: "/brand/marketplaces/otto.svg",
  KAUFLAND: "/brand/marketplaces/kaufland.svg",
  HOOD: "/brand/marketplaces/hood.svg",
  EBAY: "/brand/marketplaces/ebay.svg",
  JVMOEBEL: "/brand/marketplaces/jvmoebel.svg",
  XL: "/brand/marketplaces/xl.svg"
};

const logoFallbackByFamily: Record<SiteFamily, string> = {
  OTTO: "Ot",
  KAUFLAND: "Ka",
  HOOD: "Ho",
  EBAY: "eB",
  JVMOEBEL: "JV",
  XL: "XL"
};

type CachedSiteStatus = {
  status: SiteConnectionStatus;
  lastSync: string;
};

function formatCheckTime(now: Date): string {
  return `Checked ${now.toLocaleTimeString()}`;
}

const endpointHealthPaths: Partial<Record<SiteFamily, string>> = {
  // Otto is frozen and eBay is planned; do not call unsupported backend health routes yet.
  KAUFLAND: "/api/services/v1/marketplace/kaufland/health/",
  HOOD: "/api/services/v1/marketplace/hood/health/"
};

const databaseHealthFamilies: SiteFamily[] = ["XL", "JVMOEBEL"];
const statusOrder: Record<SiteConnectionStatus, number> = {
  NOT_FOUND: 0,
  DISCONNECTED: 1,
  CONNECTED: 2
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

function writeStatusCache(sites: MarketplaceSite[]): void {
  if (typeof window === "undefined") {
    return;
  }
  const payload: Record<string, CachedSiteStatus> = {};
  for (const site of sites) {
    payload[site.id] = {
      status: site.status,
      lastSync: site.lastSync
    };
  }
  try {
    window.localStorage.setItem(STATUS_CACHE_KEY, JSON.stringify(payload));
  } catch {
    // ignore storage write failures
  }
}

function hydrateSitesFromCache(sites: MarketplaceSite[]): MarketplaceSite[] {
  const cache = readStatusCache();
  return sites.map((site) => {
    const cached = cache[site.id];
    if (!cached) {
      return site;
    }
    return {
      ...site,
      status: cached.status,
      lastSync: cached.lastSync
    };
  });
}

export function MarketplaceGrid() {
  const t = useLabels();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [kindFilter, setKindFilter] = useState<"ALL" | SiteKind>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | SiteConnectionStatus>("ALL");
  const [interactionPulse, setInteractionPulse] = useState(0);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const fetchStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (urlHydrated) {
      return;
    }
    const queryParam = searchParams.get("q") ?? "";
    const kindParam = searchParams.get("kind");
    const statusParam = searchParams.get("status");

    setQuery(queryParam);
    if (kindParam === "JV" || kindParam === "XL") {
      setKindFilter(kindParam);
    }
    if (statusParam === "CONNECTED" || statusParam === "DISCONNECTED" || statusParam === "NOT_FOUND") {
      setStatusFilter(statusParam);
    }
    setUrlHydrated(true);
  }, [searchParams, urlHydrated]);

  useEffect(() => {
    if (!urlHydrated) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    const normalizedQuery = query.trim();

    if (normalizedQuery) params.set("q", normalizedQuery);
    else params.delete("q");

    if (kindFilter !== "ALL") params.set("kind", kindFilter);
    else params.delete("kind");

    if (statusFilter !== "ALL") params.set("status", statusFilter);
    else params.delete("status");

    const nextQuery = params.toString();
    const next = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const current = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (next === current) {
      return;
    }
    router.replace(next, { scroll: false });
  }, [kindFilter, pathname, query, router, searchParams, statusFilter, urlHydrated]);

  const marketplaceQuery = useQuery({
    queryKey: ["marketplace-statuses"],
    queryFn: async () => {
      const hasDatabaseAccess = await checkDatabaseAccess();
      const now = new Date();
      const checks = await Promise.all(
        allMarketplaceSites.map(async (site) => {
          if (databaseHealthFamilies.includes(site.family)) {
            return [site.id, { status: hasDatabaseAccess ? "CONNECTED" : "DISCONNECTED", lastSync: formatCheckTime(now) }] as const;
          }
          const path = endpointHealthPaths[site.family];
          if (!path) {
            return [site.id, { status: "NOT_FOUND", lastSync: formatCheckTime(now) }] as const;
          }
          const result = await fetchMarketplaceHealth(path);
          return [site.id, { status: result.status, lastSync: formatCheckTime(now) }] as const;
        })
      );
      return Object.fromEntries(checks) as Record<string, CachedSiteStatus>;
    },
    initialData: () => {
      if (typeof window === "undefined") return undefined;
      const cached = readStatusCache();
      return Object.keys(cached).length > 0 ? cached : undefined;
    },
    refetchInterval: 10 * 60 * 1000
  });

  useEffect(() => {
    if (marketplaceQuery.isFetching && fetchStartedAtRef.current === null) {
      fetchStartedAtRef.current = performance.now();
      return;
    }
    if (!marketplaceQuery.isFetching && fetchStartedAtRef.current !== null) {
      const duration = performance.now() - fetchStartedAtRef.current;
      fetchStartedAtRef.current = null;
      trackLatency("marketplace_status_fetch", duration, {
        kind_filter: kindFilter,
        status_filter: statusFilter
      });
    }
  }, [kindFilter, marketplaceQuery.isFetching, statusFilter]);

  useEffect(() => {
    if (!marketplaceQuery.error) return;
    trackUiError("marketplace_status_fetch_failed", marketplaceQuery.error);
  }, [marketplaceQuery.error]);

  const cards = useMemo(() => {
    const statuses = marketplaceQuery.data ?? {};
    return allMarketplaceSites.map((site) => {
      const status = statuses[site.id];
      if (!status) return site;
      return {
        ...site,
        status: status.status,
        lastSync: status.lastSync
      };
    });
  }, [marketplaceQuery.data]);

  const initialLoading = marketplaceQuery.isPending && !marketplaceQuery.data;
  const isSyncing = marketplaceQuery.isFetching;

  useEffect(() => {
    writeStatusCache(cards);
  }, [cards]);

  function handleManualSync() {
    trackUiEvent("marketplace_manual_sync_clicked", {
      kind_filter: kindFilter,
      status_filter: statusFilter
    });
    void marketplaceQuery.refetch();
  }

  const filteredSites = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return cards.filter((site) => {
      if (kindFilter !== "ALL" && site.kind !== kindFilter) {
        return false;
      }
      if (statusFilter !== "ALL" && site.status !== statusFilter) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return (
        site.name.toLowerCase().includes(normalizedQuery) ||
        site.family.toLowerCase().includes(normalizedQuery) ||
        site.id.toLowerCase().includes(normalizedQuery)
      );
    }).sort((left, right) => {
      const byStatus = statusOrder[left.status] - statusOrder[right.status];
      if (byStatus !== 0) {
        return byStatus;
      }
      return left.name.localeCompare(right.name);
    });
  }, [cards, kindFilter, query, statusFilter]);

  const kindOptions: Array<{ value: "ALL" | SiteKind; label: string }> = [
    { value: "ALL", label: t.allMarketplaceTypes },
    { value: "JV", label: t.jvOnly },
    { value: "XL", label: t.xlOnly }
  ];

  const statusOptions: Array<{ value: "ALL" | SiteConnectionStatus; label: string }> = [
    { value: "ALL", label: t.allConnectionStatuses },
    { value: "CONNECTED", label: t.connected },
    { value: "DISCONNECTED", label: t.disconnected },
    { value: "NOT_FOUND", label: t.notFound }
  ];

  return (
    <div className="space-y-4">
      <Card className="wh-command-panel ui-desktop-rhythm-section relative z-50 overflow-visible border-border/70 shadow-sm">
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <CardTitle>Marketplace Health</CardTitle>
              <CardDescription>Filter connection state, product sync coverage, and site family availability.</CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{cards.length} sites</Badge>
              <Badge variant="outline">{filteredSites.length} visible</Badge>
              <Badge variant={isSyncing ? "default" : "outline"}>{isSyncing ? t.syncing : t.sync}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4 pt-0">
        <div className="grid gap-3 lg:grid-cols-[1.25fr_1fr]">
          <div className="ui-filter-cluster">
            <span className="ui-filter-cluster-label">Primary</span>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
              <Input
                aria-label="Search marketplaces"
                className="h-10 pl-9"
                placeholder={t.searchMarketplacePlaceholder}
                value={query}
                onChange={(event) => {
                  setInteractionPulse((value) => value + 1);
                  setQuery(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="ui-filter-cluster">
            <span className="ui-filter-cluster-label">Secondary</span>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
              <Select
                value={kindFilter}
                onValueChange={(value) => {
                  setInteractionPulse((current) => current + 1);
                  setKindFilter(value as "ALL" | SiteKind);
                }}
              >
                <SelectTrigger aria-label="Filter by marketplace type" className="h-10">
                  <SelectValue placeholder={t.allMarketplaceTypes} />
                </SelectTrigger>
                <SelectContent>
                  {kindOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={statusFilter}
                onValueChange={(value) => {
                  setInteractionPulse((current) => current + 1);
                  setStatusFilter(value as "ALL" | SiteConnectionStatus);
                }}
              >
                <SelectTrigger aria-label="Filter by connection status" className="h-10">
                  <SelectValue placeholder={t.allConnectionStatuses} />
                </SelectTrigger>
                <SelectContent>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                onClick={handleManualSync}
                disabled={isSyncing}
                aria-live="polite"
                aria-busy={isSyncing}
                className="h-10 gap-2"
              >
                <RefreshCcw size={14} className={isSyncing ? "animate-spin" : ""} />
                {isSyncing ? t.syncing : t.sync}
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-3">
          <FilterPresets
            scope="marketplace-grid"
            current={{ q: query.trim(), kind: kindFilter, status: statusFilter }}
            onApply={(preset) => {
              setInteractionPulse((value) => value + 1);
              setQuery(preset.q ?? "");
              setKindFilter(preset.kind === "JV" || preset.kind === "XL" ? preset.kind : "ALL");
              setStatusFilter(
                preset.status === "CONNECTED" || preset.status === "DISCONNECTED" || preset.status === "NOT_FOUND"
                  ? preset.status
                  : "ALL"
              );
            }}
          />
        </div>
        </CardContent>
      </Card>

      <div className={`ui-desktop-rhythm-section wh-marketplace-health-grid stagger-children grid grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 ${interactionPulse % 2 === 0 ? "ui-change-flash" : ""}`}>
        {initialLoading
          ? Array.from({ length: 12 }).map((_, index) => (
              <Card
                key={`marketplace-skeleton-${index}`}
                className="ui-marketplace-card relative flex flex-col justify-between overflow-hidden p-3.5 shadow-none"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <Skeleton className="h-10 w-10 rounded-xl" />
                      <div className="space-y-1.5">
                        <Skeleton className="h-5 w-28" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                    <Skeleton className="h-5 w-20 rounded-full" />
                  </div>
                  <div className="rounded-xl border border-border/60 bg-muted/40 p-2">
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-3 w-16" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Skeleton className="h-3 w-20" />
                      <Skeleton className="h-3 w-8" />
                    </div>
                  </div>
                </div>
              </Card>
            ))
          : filteredSites.map((site) => (
          <Card
            key={site.id}
            className="ui-marketplace-card relative flex flex-col justify-between overflow-hidden border-border/70 p-3.5 shadow-sm"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className="relative flex h-10 w-10 flex-none items-center justify-center overflow-hidden rounded-xl border border-border bg-card">
                    <Image
                      src={logoByFamily[site.logo]}
                      alt={`${site.family} logo`}
                      width={40}
                      height={40}
                      className="relative z-10 h-full w-full object-contain p-1"
                      unoptimized
                      onError={(event) => {
                        event.currentTarget.style.display = "none";
                      }}
                    />
                    <span className="absolute inset-0 z-0 flex items-center justify-center text-[12px] font-semibold text-[color:var(--text-muted)]">
                      {logoFallbackByFamily[site.logo]}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <h3 className="wh-marketplace-name leading-6 text-foreground" title={site.name}>{site.name}</h3>
                    <p className="truncate text-xs text-muted-foreground">{site.family} Marketplace</p>
                  </div>
                </div>
                <Badge
                  variant={
                    site.status === "CONNECTED"
                      ? "default"
                      : site.status === "NOT_FOUND"
                        ? "destructive"
                        : "secondary"
                  }
                  className="text-[10px] uppercase tracking-[0.06em]"
                >
                  {site.status === "CONNECTED" ? t.connected : site.status === "NOT_FOUND" ? t.notFound : t.disconnected}
                </Badge>
              </div>

              <div className="rounded-xl border border-border/60 bg-muted/40 p-2 text-sm text-muted-foreground">
                <p className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{t.lastSync}</span>
                  <strong className="truncate text-xs font-semibold text-foreground">{site.lastSync}</strong>
                </p>
                <p className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{t.productsInDb}</span>
                  <strong className="text-xs font-semibold text-foreground">{site.productsInDb}</strong>
                </p>
              </div>
            </div>
          </Card>
        ))}
      </div>
      {!initialLoading && filteredSites.length === 0 ? (
        <EmptyState
          title="No marketplaces found"
          description="Try changing the search query or clearing the current filters."
        />
      ) : null}
    </div>
  );
}

