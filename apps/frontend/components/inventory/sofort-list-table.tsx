"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { useLabels } from "../../app/use-labels";
import { trackLatency, trackUiError } from "../../app/telemetry";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { ErrorState } from "../ui/error-state";
import { TableShell } from "../ui/table-shell";
import { AddProductButton } from "./add-item-button";
import { fetchInventoryRows } from "./inventory-api";
import { getPrimaryPhoto, normalizePhotoList, normalizePlaceValue } from "./inventory-table-utils";
import { resolveMarketplaceActive } from "./sofort-list/sofort-list-jv-status";
import { SofortListEmptyState } from "./sofort-list/sofort-list-empty-state";
import { SofortListErrorState } from "./sofort-list/sofort-list-error-state";
import { SofortListLoadingState } from "./sofort-list/sofort-list-loading-state";
import { SofortListPagination } from "./sofort-list/sofort-list-pagination";
import { SofortListTableShell } from "./sofort-list/sofort-list-table-shell";
import { SofortListToolbar } from "./sofort-list/sofort-list-toolbar";
import type { SofortListRow } from "./sofort-list/sofort-list-types";

function highlightText(value: string, query: string) {
  void query;
  return value;
}

function normalizeEanValue(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function extractSiteEans(item: Record<string, unknown>, fallback: string) {
  return {
    jv: normalizeEanValue(item.jv_ean ?? item.ean_jv ?? item.jv_site_ean ?? item.jvSiteEan, fallback),
    xl: normalizeEanValue(item.xl_ean ?? item.ean_xl ?? item.xl_site_ean ?? item.xlSiteEan, fallback),
    ottoJv: normalizeEanValue(item.otto_jv_ean ?? item.otto_ean_jv ?? item.ean_otto_jv ?? item.ottoJvEan, fallback),
    ottoXl: normalizeEanValue(item.otto_xl_ean ?? item.otto_ean_xl ?? item.ean_otto_xl ?? item.ottoXlEan, fallback),
    ebayJv: normalizeEanValue(item.ebay_jv_ean ?? item.ebay_ean_jv ?? item.ean_ebay_jv ?? item.ebayJvEan, fallback),
    ebayXl: normalizeEanValue(item.ebay_xl_ean ?? item.ebay_ean_xl ?? item.ean_ebay_xl ?? item.ebayXlEan, fallback),
    kauflandJv: normalizeEanValue(item.kaufland_jv_ean ?? item.kfl_jv_ean ?? item.ean_kaufland_jv ?? item.kauflandJvEan, fallback),
    kauflandXl: normalizeEanValue(item.kaufland_xl_ean ?? item.kfl_xl_ean ?? item.ean_kaufland_xl ?? item.kauflandXlEan, fallback),
    hoodJv: normalizeEanValue(item.hood_jv_ean ?? item.ean_hood_jv ?? item.hoodJvEan, fallback),
    hoodXl: normalizeEanValue(item.hood_xl_ean ?? item.ean_hood_xl ?? item.hoodXlEan, fallback)
  };
}

function firstSkuEan(item: Record<string, unknown>): string | null {
  const raw = item.sku_eans;
  if (!Array.isArray(raw)) return null;
  for (const value of raw) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function displayNullable(value: string | null): string {
  if (value === null) return "null";
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : "null";
}

export function SofortListTable() {
  const t = useLabels();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const placeholderEan = "0000000000000";

  const [rows, setRows] = useState<SofortListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [roomFilter, setRoomFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [listingFilter, setListingFilter] = useState("all");
  const [backendPage, setBackendPage] = useState(1);
  const [backendPageSize] = useState(16);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [showFilters, setShowFilters] = useState(false);
  const fetchStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (urlHydrated) return;
    const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
    setQuery(searchParams.get("q") ?? "");
    setRoomFilter(searchParams.get("room") ?? "all");
    setTypeFilter(searchParams.get("type") ?? "all");
    setListingFilter(searchParams.get("listing") ?? "all");
    setBackendPage(Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1);
    setUrlHydrated(true);
  }, [searchParams, urlHydrated]);

  useEffect(() => {
    if (!urlHydrated) return;
    const params = new URLSearchParams(searchParams.toString());
    const normalizedQuery = query.trim();
    if (normalizedQuery) params.set("q", normalizedQuery);
    else params.delete("q");
    if (roomFilter !== "all") params.set("room", roomFilter);
    else params.delete("room");
    if (typeFilter !== "all") params.set("type", typeFilter);
    else params.delete("type");
    if (listingFilter !== "all") params.set("listing", listingFilter);
    else params.delete("listing");
    params.delete("sort");
    params.delete("dir");
    if (backendPage > 1) params.set("page", String(backendPage));
    else params.delete("page");
    const nextQuery = params.toString();
    const next = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const current = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (next !== current) router.replace(next, { scroll: false });
  }, [backendPage, listingFilter, pathname, query, roomFilter, router, searchParams, typeFilter, urlHydrated]);

  const normalizedServerQuery = query.trim();
  const serverPlaceSort: "asc" | "desc" = "asc";
  const serverRoom = roomFilter !== "all" ? roomFilter : undefined;
  const serverType = typeFilter !== "all" ? typeFilter : undefined;
  const serverListing = listingFilter === "listed" || listingFilter === "unlisted" ? listingFilter : undefined;

  const sofortListQuery = useQuery({
    queryKey: ["sofort-list-rows", backendPage, backendPageSize, normalizedServerQuery, serverPlaceSort, serverRoom, serverType, serverListing],
    queryFn: () =>
      fetchInventoryRows({
        page: backendPage,
        pageSize: backendPageSize,
        q: normalizedServerQuery || undefined,
        placeSort: serverPlaceSort,
        room: serverRoom,
        type: serverType,
        listing: serverListing
      })
  });

  useEffect(() => {
    if (sofortListQuery.isFetching && fetchStartedAtRef.current === null) {
      fetchStartedAtRef.current = performance.now();
      return;
    }
    if (!sofortListQuery.isFetching && fetchStartedAtRef.current !== null) {
      const duration = performance.now() - fetchStartedAtRef.current;
      fetchStartedAtRef.current = null;
      trackLatency("sofort_list_fetch", duration, { page: backendPage, page_size: backendPageSize });
    }
  }, [backendPage, backendPageSize, sofortListQuery.isFetching]);

  useEffect(() => setLoading(sofortListQuery.isPending), [sofortListQuery.isPending]);

  useEffect(() => {
    if (!sofortListQuery.error) return setError(null);
    trackUiError("sofort_list_fetch_failed", sofortListQuery.error, { page: backendPage });
    setError(sofortListQuery.error instanceof Error ? sofortListQuery.error.message : "Failed to load list.");
  }, [backendPage, sofortListQuery.error]);

  useEffect(() => {
    const payload = sofortListQuery.data;
    if (!payload) return;
    const items = Array.isArray(payload) ? payload : Array.isArray(payload.results) ? payload.results : [];
    const mappedRows = items.map((item) => {
      const rawItem = item as Record<string, unknown>;
      const photos = normalizePhotoList(item.photo);
      const skuFallback = firstSkuEan(rawItem);
      const eanFallback = skuFallback ?? "";
      const siteEans = extractSiteEans(rawItem, "");
      const normalizedRowEan =
        typeof (item as { database_ean?: unknown }).database_ean === "string" && (item as { database_ean?: string }).database_ean?.trim()
          ? (item as { database_ean?: string }).database_ean!.trim()
          : typeof (item as { main_ean?: unknown }).main_ean === "string" && (item as { main_ean?: string }).main_ean?.trim()
            ? (item as { main_ean?: string }).main_ean!.trim()
            : typeof (item as { ean?: unknown }).ean === "string" && (item as { ean?: string }).ean?.trim()
          ? (item as { ean?: string }).ean!.trim()
          : typeof (item as { product_ean?: unknown }).product_ean === "string" && (item as { product_ean?: string }).product_ean?.trim()
            ? (item as { product_ean?: string }).product_ean!.trim()
            : eanFallback;

      const normalizedSiteEans = {
        jv: siteEans.jv,
        xl: siteEans.xl,
        ottoJv: siteEans.ottoJv,
        ottoXl: siteEans.ottoXl,
        ebayJv: siteEans.ebayJv,
        ebayXl: siteEans.ebayXl,
        kauflandJv: siteEans.kauflandJv,
        kauflandXl: siteEans.kauflandXl,
        hoodJv: siteEans.hoodJv,
        hoodXl: siteEans.hoodXl
      };
      const marketplaceActive = resolveMarketplaceActive(rawItem);

      return {
        id: item.id,
        kidId: item.kid_id,
        orderDbId: typeof item.order_db_id === "number" && Number.isFinite(item.order_db_id) ? item.order_db_id : null,
        kidNumber: item.kid_number ?? "-",
        ean: normalizedRowEan,
        siteEans: normalizedSiteEans,
        photo: getPrimaryPhoto(item.photo),
        photoCount: item.photo_count ?? photos.length,
        place: normalizePlaceValue(item.place),
        store: rawItem.store === true,
        quantity: typeof item.quantity === "number" && Number.isFinite(item.quantity) ? item.quantity : 0,
        room: typeof item.room === "string" && item.room.trim().length > 0 ? item.room.trim() : null,
        furnitureType: typeof item.type === "string" && item.type.trim().length > 0 ? item.type.trim() : null,
        company: typeof rawItem.company === "string" && rawItem.company.trim().length > 0 ? rawItem.company.trim() : null,
        commentary: typeof rawItem.commentary === "string" && rawItem.commentary.trim().length > 0 ? rawItem.commentary.trim() : null,
        color: typeof rawItem.color === "string" && rawItem.color.trim().length > 0 ? rawItem.color.trim() : null,
        size: typeof rawItem.size === "string" && rawItem.size.trim().length > 0 ? rawItem.size.trim() : null,
        material: typeof rawItem.material === "string" && rawItem.material.trim().length > 0 ? rawItem.material.trim() : null,
        price: typeof rawItem.price === "string" && rawItem.price.trim().length > 0 ? rawItem.price.trim() : null,
        priceCurrency: typeof rawItem.price_currency === "string" && rawItem.price_currency.trim().length > 0 ? rawItem.price_currency.trim() : null,
        listingStatus: item.listing_status === "listed" ? "listed" : "unlisted",
        marketplaceActive,
      } satisfies SofortListRow;
    });

    setRows(mappedRows);
    if (Array.isArray(payload)) {
      setHasNextPage(false);
      setHasPrevPage(backendPage > 1);
    } else {
      setHasNextPage(Boolean(payload.next));
      setHasPrevPage(Boolean(payload.previous));
    }
  }, [backendPage, placeholderEan, sofortListQuery.data]);

  const roomOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.room ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);
  const typeOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.furnitureType ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);

  const sortedRows = rows;

  const allVisibleSelected = useMemo(() => sortedRows.length > 0 && sortedRows.every((row) => selectedRowIds.has(row.id)), [selectedRowIds, sortedRows]);
  const hasActiveFilters = roomFilter !== "all" || typeFilter !== "all" || listingFilter !== "all";

  function toggleRowSelection(rowId: string) {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  function toggleSelectVisible() {
    setSelectedRowIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) for (const row of sortedRows) next.delete(row.id);
      else for (const row of sortedRows) next.add(row.id);
      return next;
    });
  }

  function resetFiltersAndSearch() {
    setQuery("");
    setRoomFilter("all");
    setTypeFilter("all");
    setListingFilter("all");
    setBackendPage(1);
  }

  function updateRowDraft(nextRow: SofortListRow) {
    setRows((current) => current.map((row) => (row.id === nextRow.id ? nextRow : row)));
  }

  return (
    <div className="wh-sofort-page">
      {error ? <SofortListErrorState message={error} onRetry={() => void sofortListQuery.refetch()} retrying={sofortListQuery.isFetching} /> : null}
      <Card className="wh-sofort-toolbar-card wh-section-card">
        <CardContent className="wh-section-card__body">
          <SofortListToolbar
            query={query}
            searchPlaceholder={t.searchSofortPlaceholder}
            primaryAction={<AddProductButton onCreated={() => sofortListQuery.refetch()} />}
            showFilters={showFilters}
            hasActiveFilters={hasActiveFilters}
            roomFilter={roomFilter}
            typeFilter={typeFilter}
            listingFilter={listingFilter}
            roomOptions={roomOptions}
            typeOptions={typeOptions}
            statusText={loading ? t.loadingRows : `${t.rows}: ${rows.length}`}
            onQueryChange={setQuery}
            onToggleFilters={() => setShowFilters((current) => !current)}
            onRoomFilterChange={setRoomFilter}
            onTypeFilterChange={setTypeFilter}
            onListingFilterChange={setListingFilter}
            onReset={resetFiltersAndSearch}
            labels={{ allRooms: t.allRooms, allTypes: t.allTypes, allListingStatuses: t.allListingStatuses, listed: t.listed, unlisted: t.unlisted, clear: t.clear }}
          />
        </CardContent>
      </Card>
      <Card className="wh-sofort-table-card wh-section-card">
        <CardContent className="wh-section-card__body wh-sofort-table-body p-0">
          {error ? (
            <div className="wh-section-card__body--center">
              <ErrorState
                title="Inventory service unavailable"
                description="The list could not be loaded because the inventory service returned an error."
                className="max-w-xl"
              />
              <Button type="button" variant="outline" onClick={() => void sofortListQuery.refetch()} disabled={sofortListQuery.isFetching}>
                Retry
              </Button>
            </div>
          ) : loading ? (
            <SofortListLoadingState />
          ) : sortedRows.length === 0 ? (
            <TableShell bodyClassName="p-4">
              <SofortListEmptyState clearLabel={t.clear} onReset={resetFiltersAndSearch} />
            </TableShell>
          ) : (
            <>
              <SofortListTableShell
                rows={sortedRows}
                query={query}
                selectedRowIds={selectedRowIds}
                allVisibleSelected={allVisibleSelected}
                placeholderEan={placeholderEan}
                onToggleSelectVisible={toggleSelectVisible}
                onToggleRowSelection={toggleRowSelection}
                onUpdateRow={updateRowDraft}
                onRefresh={() => void sofortListQuery.refetch()}
                highlightText={highlightText}
                labels={{
                  place: t.place,
                  quantity: t.quantity,
                  room: t.room,
                  type: t.type,
                  active: t.active,
                  inactive: t.inactive,
                  activate: t.activate,
                  delete: t.delete,
                  deactivate: t.deactivate,
                  deleteFailed: t.deleteFailed,
                  markedActive: t.markedActive,
                  markedInactive: t.markedInactive,
                  resultSuccessSites: t.resultSuccessSites,
                  resultFailedSites: t.resultFailedSites,
                  resultNoSiteData: t.resultNoSiteData,
                  resultDialogTitle: t.resultDialogTitle,
                  confirmActionTitle: t.confirmActionTitle,
                  confirmActionMessage: t.confirmActionMessage,
                  confirmActionCancel: t.cancel,
                  confirmActionConfirm: t.confirm,
                  confirmActionDetails: t.confirmActionDetails,
                  confirmActionLive: t.confirmActionLive,
                  confirmActionPending: t.confirmActionPending,
                  confirmActionCurrentPlace: t.confirmActionCurrentPlace,
                  confirmActionNewPlace: t.confirmActionNewPlace,
                  confirmActionPlacePlaceholder: t.confirmActionPlacePlaceholder,
                  confirmActionPlaceRequired: t.confirmActionPlaceRequired,
                  confirmActionFootnoteDeactivate: t.confirmActionFootnoteDeactivate,
                  confirmActionFootnoteActivate: t.confirmActionFootnoteActivate,
                }}
              />
              {!error && rows.length > 0 ? (
                <SofortListPagination
                  page={backendPage}
                  hasPrevPage={hasPrevPage}
                  hasNextPage={hasNextPage}
                  onPrev={() => setBackendPage((page) => Math.max(1, page - 1))}
                  onNext={() => setBackendPage((page) => page + 1)}
                />
              ) : null}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
