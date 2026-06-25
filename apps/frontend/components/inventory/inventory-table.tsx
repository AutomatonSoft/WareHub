"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { trackLatency, trackUiError } from "../../app/telemetry";
import { Card } from "../shared/card";
import { Checkbox } from "../ui/checkbox";
import { EmptyState } from "../shared/empty-state";
import { TableErrorBanner } from "../shared/table/table-error-banner";
import { MobileListSkeletonCard } from "../shared/table/mobile-list-skeleton-card";
import { TableToolbar } from "../shared/table/table-toolbar";
import { AddProductButton } from "./add-item-button";
import { deleteInventoryEntity, fetchInventoryRows } from "./inventory-api";
import { ImportKidGreenButton } from "./import-kid-green-button";
import { formatDate, getPrimaryPhoto, type KidDto, type InventoryRow, normalizePhotoList } from "./inventory-table-utils";
import { InventoryTableRows } from "./inventory-table-rows";

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlightText(value: string, query: string) {
  const normalized = query.trim();
  if (!normalized) return value;
  const normalizedLower = normalized.toLowerCase();
  const regex = new RegExp(`(${escapeRegex(normalized)})`, "ig");
  const parts = value.split(regex);
  if (parts.length === 1) return value;
  return parts.map((part, index) =>
    part.toLowerCase() === normalizedLower
      ? <mark key={`${part}-${index}`} className="rounded bg-[color:rgba(129,135,255,0.22)] px-0.5 text-[color:var(--text-primary)]">{part}</mark>
      : <span key={`${part}-${index}`}>{part}</span>
  );
}

type SortField = "orderId" | "meta" | "paymentStatus" | "status" | "date";

export function InventoryTable() {
  const t = useLabels();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [backendPage, setBackendPage] = useState(1);
  const [backendPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [sortField, setSortField] = useState<SortField>("date");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const hydratedFromUrlRef = useRef(false);
  const fetchStartedAtRef = useRef<number | null>(null);
  const normalizedQuery = query.trim();

  useEffect(() => {
    if (hydratedFromUrlRef.current) return;
    const queryParam = searchParams.get("q") ?? "";
    const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const sortFieldParam = searchParams.get("sort");
    const sortDirParam = searchParams.get("dir");

    setQuery(queryParam);
    setBackendPage(Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1);
    if (sortFieldParam === "orderId" || sortFieldParam === "meta" || sortFieldParam === "paymentStatus" || sortFieldParam === "status" || sortFieldParam === "date") {
      setSortField(sortFieldParam);
    }
    if (sortDirParam === "asc" || sortDirParam === "desc") {
      setSortDirection(sortDirParam);
    }
    hydratedFromUrlRef.current = true;
  }, [searchParams]);

  useEffect(() => {
    if (!hydratedFromUrlRef.current) return;
    const params = new URLSearchParams(searchParams.toString());
    if (normalizedQuery) params.set("q", normalizedQuery);
    else params.delete("q");
    if (backendPage > 1) params.set("page", String(backendPage));
    else params.delete("page");
    if (sortField !== "date") params.set("sort", sortField);
    else params.delete("sort");
    if (sortDirection !== "desc") params.set("dir", sortDirection);
    else params.delete("dir");

    const nextQuery = params.toString();
    const next = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const current = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (next === current) return;
    router.replace(next, { scroll: false });
  }, [backendPage, normalizedQuery, pathname, router, searchParams, sortDirection, sortField]);

  useEffect(() => {
    if (!hydratedFromUrlRef.current) return;
    setBackendPage(1);
  }, [normalizedQuery]);

  const inventoryQuery = useQuery({
    queryKey: ["inventory-rows", backendPageSize],
    queryFn: async () => {
      const first = await fetchInventoryRows({ page: 1, pageSize: 200 });
      if (Array.isArray(first)) return first;

      const collected = Array.isArray(first.results) ? [...first.results] : [];
      const total =
        typeof first.count === "number" && Number.isFinite(first.count) && first.count > 0
          ? first.count
          : collected.length;
      const totalPages = Math.max(1, Math.ceil(total / 200));

      for (let page = 2; page <= totalPages; page += 1) {
        const nextPage = await fetchInventoryRows({ page, pageSize: 200 });
        const items = Array.isArray(nextPage) ? nextPage : Array.isArray(nextPage.results) ? nextPage.results : [];
        if (items.length === 0) break;
        collected.push(...items);
      }

      return collected;
    }
  });

  useEffect(() => {
    if (inventoryQuery.isFetching && fetchStartedAtRef.current === null) {
      fetchStartedAtRef.current = performance.now();
      return;
    }

    if (!inventoryQuery.isFetching && fetchStartedAtRef.current !== null) {
      const duration = performance.now() - fetchStartedAtRef.current;
      fetchStartedAtRef.current = null;
      trackLatency("inventory_table_fetch", duration, { page: backendPage, page_size: backendPageSize });
    }
  }, [backendPage, backendPageSize, inventoryQuery.isFetching]);

  useEffect(() => {
    setLoading(inventoryQuery.isPending);
  }, [inventoryQuery.isPending]);

  useEffect(() => {
    if (!inventoryQuery.error) {
      setError(null);
      return;
    }
    trackUiError("inventory_table_fetch_failed", inventoryQuery.error, { page: backendPage });
    setError(inventoryQuery.error instanceof Error ? inventoryQuery.error.message : t.failedLoadInventory);
  }, [backendPage, inventoryQuery.error, t.failedLoadInventory]);

  useEffect(() => {
    const payload = inventoryQuery.data;
    if (!payload) return;

    const items: KidDto[] = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { results?: KidDto[] }).results)
        ? ((payload as { results?: KidDto[] }).results ?? [])
        : [];
    const mappedRows = items
      .filter((item) => item.entity === "order" || item.entity === "kid")
      .map((item) => {
        const photos = normalizePhotoList(item.photo);
        return {
          id: item.id,
          kidNumber: item.kid_number ?? "-",
          kidAccount: item.kid_account?.trim() || "-",
          kidId: item.kid_id,
          orderDbId: item.order_db_id ?? null,
          entity: item.entity,
          orderId: item.order_id?.trim() || item.parent_order_id?.trim() || "-",
          buyer: item.buyer?.trim() || "-",
          additionalOrderIds: item.additional_order_ids_text?.trim() || "-",
          platform: item.platform?.trim() || "-",
          title: item.title || "-",
          memo: item.memo?.trim() || "-",
          sku: item.sku?.trim() || "-",
          paymentStatus: item.payment_status?.trim() || item.global_price?.trim() || "-",
          status: item.status || "no_paid",
          date: formatDate(item.date),
          photo: getPrimaryPhoto(item.photo),
          photos,
          photoCount: String(item.photo_count ?? photos.length),
        } satisfies InventoryRow;
      });

    setRows(mappedRows);
    setTotalCount(mappedRows.length);
  }, [inventoryQuery.data]);

  const filteredRows = useMemo(() => {
    if (!normalizedQuery) return rows;
    const tokens = normalizedQuery.toLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter((row) => {
      const haystack = [
        row.kidNumber,
        row.orderId,
        row.platform,
        row.buyer,
        row.sku,
        row.title,
        row.memo,
        row.additionalOrderIds,
        row.paymentStatus,
        row.status,
        row.date,
      ].join(" ").toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    });
  }, [normalizedQuery, rows]);

  const sortedRows = useMemo(() => {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });
    const parsePrice = (value: string) => {
      const normalized = value.replace(/\s/g, "").replace(/[^0-9,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    };
    const parseDateValue = (value: string) => {
      const parsed = Date.parse(value);
      return Number.isFinite(parsed) ? parsed : Number.NaN;
    };

    const sortable = [...filteredRows];
    sortable.sort((left, right) => {
      let order = 0;
      if (sortField === "orderId") {
        order = collator.compare(left.orderId, right.orderId);
      } else if (sortField === "meta") {
        order = collator.compare(
          `${left.platform} ${left.buyer} ${left.sku} ${left.additionalOrderIds}`,
          `${right.platform} ${right.buyer} ${right.sku} ${right.additionalOrderIds}`
        );
      } else if (sortField === "paymentStatus") {
        const l = parsePrice(left.paymentStatus);
        const r = parsePrice(right.paymentStatus);
        order = Number.isFinite(l) && Number.isFinite(r) ? l - r : collator.compare(left.paymentStatus, right.paymentStatus);
      } else if (sortField === "status") {
        order = collator.compare(left.status, right.status);
      } else if (sortField === "date") {
        const l = parseDateValue(left.date);
        const r = parseDateValue(right.date);
        order = Number.isFinite(l) && Number.isFinite(r) ? l - r : collator.compare(left.date, right.date);
      }
      if (order === 0) order = collator.compare(left.orderId, right.orderId);
      return sortDirection === "asc" ? order : -order;
    });
    return sortable;
  }, [filteredRows, sortDirection, sortField]);

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection(field === "date" ? "desc" : "asc");
  }

  function sortIcon(field: SortField) {
    if (sortField !== field) return <ArrowUpDown size={12} className="ui-sort-bump" />;
    return sortDirection === "asc" ? <ArrowUp size={12} className="ui-sort-bump" /> : <ArrowDown size={12} className="ui-sort-bump" />;
  }

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / backendPageSize));
  const hasPrevPage = backendPage > 1;
  const hasNextPage = backendPage < totalPages;
  const paginatedRows = sortedRows.slice((backendPage - 1) * backendPageSize, backendPage * backendPageSize);
  const allVisibleSelected = paginatedRows.length > 0 && paginatedRows.every((row) => selectedRowIds.has(row.id));
  const pageNumbers = (() => {
    const start = Math.max(1, backendPage - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  })();

  useEffect(() => {
    if (backendPage > totalPages) setBackendPage(totalPages);
  }, [backendPage, totalPages]);

  async function handleDeleteRow(row: InventoryRow) {
    if (deletingRowId) return;

    const shouldDelete = window.confirm(`${t.delete} order ${row.orderId} and related kid data?`);
    if (!shouldDelete) return;

    setDeletingRowId(row.id);
    try {
      await deleteInventoryEntity({
        entity: row.entity,
        orderDbId: row.orderDbId,
        kidId: row.kidId,
      });
      await inventoryQuery.refetch();
      setSelectedRowIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
    } catch (deleteError) {
      const refreshed = await inventoryQuery.refetch().catch(() => null);
      const payload = refreshed?.data ?? inventoryQuery.data;
      const pagedPayload = payload && typeof payload === "object" ? (payload as { results?: KidDto[] }) : null;
      const items: KidDto[] = Array.isArray(payload)
        ? payload
        : Array.isArray(pagedPayload?.results)
          ? (pagedPayload?.results ?? [])
          : [];
      const rowStillExists = items.some((item) => item.id === row.id);

      if (!rowStillExists) {
        setSelectedRowIds((current) => {
          const next = new Set(current);
          next.delete(row.id);
          return next;
        });
        return;
      }

      const message = deleteError instanceof Error ? deleteError.message : t.deleteFailed;
      window.alert(message);
    } finally {
      setDeletingRowId(null);
    }
  }

  return (
    <Card className="wh-inventory-shell overflow-visible border-0 bg-transparent p-0 shadow-none">
      <TableToolbar
        scope="inventory-table"
        query={query}
        onQueryChange={setQuery}
        searchPlaceholder={t.searchInventoryPlaceholder}
        filtersSlot={
          <>
            <ImportKidGreenButton onImported={() => inventoryQuery.refetch()} />
            <AddProductButton onCreated={() => inventoryQuery.refetch()} />
          </>
        }
      />

      {error ? (
        <TableErrorBanner message={error} onRetry={() => void inventoryQuery.refetch()} />
      ) : (
        <>
          <div className="space-y-2 px-2 py-2 md:hidden" aria-busy={loading ? "true" : "false"}>
            {loading
              ? Array.from({ length: 6 }).map((_, index) => (
                  <MobileListSkeletonCard key={`inventory-mobile-skeleton-${index}`} index={index} withThumb />
                ))
              : paginatedRows.map((row) => (
                  <div key={`inventory-mobile-${row.id}`} className="ui-table-card p-3">
                    <div className="flex gap-3">
                      {row.photo !== "-" ? (
                        <div className="relative">
                          <Image src={row.photo} alt={`${t.kid} ${row.kidNumber}`} width={72} height={72} unoptimized className="h-[72px] w-[72px] rounded-xl border border-[color:var(--outline)] object-cover" />
                          <div className="absolute -bottom-1 -right-1 rounded-full border border-white/70 bg-[color:rgba(15,23,42,0.8)] px-2 py-0.5 text-[10px] font-semibold text-white shadow-sm">
                            {row.photoCount}
                          </div>
                        </div>
                      ) : (
                        <div className="h-[72px] w-[72px] rounded-xl border border-dashed border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.05)]" />
                      )}
                      <div className="min-w-0 flex-1 space-y-1">
                        <Link href={`/inventory/kid/${row.kidId}`} className="inline-block truncate text-sm font-semibold text-[color:var(--primary)] underline-offset-2 hover:underline">
                          {highlightText(row.kidNumber, query)}
                        </Link>
                        <p className="truncate text-xs text-[color:var(--text-secondary)]">{t.orderId}: {highlightText(row.orderId, query)}</p>
                        <p className="truncate text-xs text-[color:var(--text-secondary)]">{t.platform}: {highlightText(row.platform, query)} · {t.buyer}: {highlightText(row.buyer, query)}</p>
                        <p className="truncate text-xs text-[color:var(--text-secondary)]">{t.sku}: {highlightText(row.sku, query)}</p>
                        <p className="truncate text-xs text-[color:var(--text-secondary)]">{t.payment}: {highlightText(row.paymentStatus, query)}</p>
                      </div>
                    </div>
                  </div>
                ))}
            {!loading && paginatedRows.length === 0 ? (
              <EmptyState
                compact
                variant="inventory"
                title="No inventory matches"
                message="Try another query."
                actionLabel={query.trim() ? t.clearSearch : undefined}
                onAction={query.trim() ? () => setQuery("") : undefined}
              />
            ) : null}
          </div>
          <div className="wh-sofort-table-shell">
            <div className="wh-sofort-table-frame">
              <div className="wh-inventory-table-wrap ui-desktop-rhythm-table hidden max-w-full overflow-visible px-0 pb-0 pt-0 md:block">
                <table className="ui-listing-table wh-inventory-data-table w-full min-w-[1380px] border-separate border-spacing-y-0 text-left text-sm">
                  <thead>
                    <tr className="ui-table-head-row sticky top-0 z-10">
                      <th scope="col" className="ui-listing-head-cell w-[44px] px-2 py-3 text-center">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={() =>
                            setSelectedRowIds((current) => {
                              const next = new Set(current);
                              if (allVisibleSelected) {
                                paginatedRows.forEach((row) => next.delete(row.id));
                              } else {
                                paginatedRows.forEach((row) => next.add(row.id));
                              }
                              return next;
                            })
                          }
                          aria-label="Select visible rows"
                        />
                      </th>
                      <th scope="col" className="ui-listing-head-cell w-[140px] px-3 py-3 text-center"><span className="ui-table-head-label">IMAGE</span></th>
                      <th scope="col" className="ui-listing-head-cell w-[230px] px-3 py-3">
                        <button type="button" onClick={() => toggleSort("orderId")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                          <span className="ui-table-head-label">{t.kidOrder}</span>
                          {sortIcon("orderId")}
                        </button>
                      </th>
                      <th scope="col" className="ui-listing-head-cell w-[280px] px-3 py-3">
                        <button type="button" onClick={() => toggleSort("meta")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                          <span className="ui-table-head-label">ORDER META</span>
                          {sortIcon("meta")}
                        </button>
                      </th>
                      <th scope="col" className="ui-listing-head-cell w-[320px] px-3 py-3"><span className="ui-table-head-label">{t.memo}</span></th>
                      <th scope="col" className="ui-listing-head-cell w-[150px] px-3 py-3">
                        <button type="button" onClick={() => toggleSort("paymentStatus")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                          <span className="ui-table-head-label">{t.payment}</span>
                          {sortIcon("paymentStatus")}
                        </button>
                      </th>
                      <th scope="col" className="ui-listing-head-cell w-[120px] px-3 py-3">
                        <button type="button" onClick={() => toggleSort("status")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                          <span className="ui-table-head-label">{t.status}</span>
                          {sortIcon("status")}
                        </button>
                      </th>
                      <th scope="col" className="ui-listing-head-cell w-[140px] px-3 py-3">
                        <button type="button" onClick={() => toggleSort("date")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                          <span className="ui-table-head-label">{t.date || "Date"}</span>
                          {sortIcon("date")}
                        </button>
                      </th>
                      <th scope="col" className="ui-listing-head-cell ui-listing-sticky-head wh-inventory-actions-head w-[90px] px-3 py-3 text-center"><span className="ui-table-head-label">{t.actions}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    <InventoryTableRows
                      loading={loading}
                      rows={paginatedRows}
                      filteredCount={filteredRows.length}
                      deletingRowId={deletingRowId}
                      emptyActionLabel={query.trim() ? t.clearSearch : undefined}
                      onEmptyAction={query.trim() ? () => setQuery("") : undefined}
                      selectedRowIds={selectedRowIds}
                      onToggleRowSelection={(rowId) =>
                        setSelectedRowIds((current) => {
                          const next = new Set(current);
                          if (next.has(rowId)) next.delete(rowId);
                          else next.add(rowId);
                          return next;
                        })
                      }
                      onDeleteRow={handleDeleteRow}
                    />
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}

      {!error && !loading && filteredRows.length > 0 ? (
        <div className="wh-sofort-pagination">
          <p className="wh-sofort-pagination__label">{t.backendPageSize}: {backendPageSize} · {t.total}: {totalCount}</p>
          <div className="wh-sofort-pagination__actions">
            <button type="button" className="ui-button ui-button-ghost h-8 rounded-xl px-3" onClick={() => setBackendPage(1)} disabled={!hasPrevPage}>First</button>
            <button type="button" className="ui-button ui-button-ghost h-8 rounded-xl px-3" onClick={() => setBackendPage((page) => Math.max(1, page - 1))} disabled={!hasPrevPage}>Prev</button>
            <div className="inline-flex items-center gap-1">
              {pageNumbers.map((page) => (
                <button
                  key={`inventory-page-${page}`}
                  type="button"
                  onClick={() => setBackendPage(page)}
                  className={`h-8 min-w-8 rounded-lg px-2 text-sm ${page === backendPage ? "bg-[color:var(--primary)] text-white" : "border border-[color:var(--outline)] bg-white text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-high)]"}`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button type="button" className="ui-button ui-button-ghost h-8 rounded-xl px-3" onClick={() => setBackendPage((page) => page + 1)} disabled={!hasNextPage}>Next</button>
            <button type="button" className="ui-button ui-button-ghost h-8 rounded-xl px-3" onClick={() => setBackendPage(totalPages)} disabled={!hasNextPage}>Last</button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
