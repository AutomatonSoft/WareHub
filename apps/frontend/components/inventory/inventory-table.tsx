"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ArrowUpDown, Search, X } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { trackLatency, trackUiError } from "../../app/telemetry";
import { Card } from "../shared/card";
import { Checkbox } from "../ui/checkbox";
import { Button } from "../ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../ui/dropdown-menu";
import { EmptyState } from "../shared/empty-state";
import { TableErrorBanner } from "../shared/table/table-error-banner";
import { MobileListSkeletonCard } from "../shared/table/mobile-list-skeleton-card";
import { TableToolbar } from "../shared/table/table-toolbar";
import { useVirtualRows } from "../shared/table/use-virtual-rows";
import { AddProductButton } from "./add-item-button";
import { deleteInventoryEntity, fetchInventoryRows } from "./inventory-api";
import {
  formatDate,
  getVisibleColumnsByWidth,
  getPrimaryPhoto,
  type KidDto,
  type InventoryRow,
  normalizePlaceValue,
  normalizePhotoList,
  type VisibleColumns
} from "./inventory-table-utils";
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

export function InventoryTable() {
  const t = useLabels();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [placeQuery, setPlaceQuery] = useState("");
  const [rows, setRows] = useState<InventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());
  const [backendPage, setBackendPage] = useState(1);
  const [backendPageSize] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [sortField, setSortField] = useState<"id" | "place" | "qty" | "globalPrice" | "status" | "date">("place");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [kidOrderFilterSearch, setKidOrderFilterSearch] = useState("");
  const [placeFilterSearch, setPlaceFilterSearch] = useState("");
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [tableScrollTop, setTableScrollTop] = useState(0);
  const [tableViewportHeight, setTableViewportHeight] = useState(0);
  const [visibleColumns, setVisibleColumns] = useState<VisibleColumns>({
    date: true,
    place: true,
    platform: true,
    quantity: true
  });
  const hydratedFromUrlRef = useRef(false);
  const fetchStartedAtRef = useRef<number | null>(null);
  const normalizedQuery = query.trim();
  const normalizedPlaceQuery = placeQuery.trim();

  useEffect(() => {
    if (hydratedFromUrlRef.current) return;
    const queryParam = searchParams.get("q") ?? "";
    const placeQueryParam = searchParams.get("place_q") ?? "";
    const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const sortFieldParam = searchParams.get("sort");
    const sortDirParam = searchParams.get("dir");

    setQuery(queryParam);
    setPlaceQuery(placeQueryParam);
    setBackendPage(Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1);
    if (sortFieldParam === "id" || sortFieldParam === "place" || sortFieldParam === "qty" || sortFieldParam === "globalPrice" || sortFieldParam === "status" || sortFieldParam === "date") {
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
    const normalizedQuery = query.trim();
    const normalizedPlaceQuery = placeQuery.trim();
    if (normalizedQuery) params.set("q", normalizedQuery);
    else params.delete("q");
    if (normalizedPlaceQuery) params.set("place_q", normalizedPlaceQuery);
    else params.delete("place_q");

    if (backendPage > 1) params.set("page", String(backendPage));
    else params.delete("page");

    if (sortField !== "place") params.set("sort", sortField);
    else params.delete("sort");
    if (sortDirection !== "asc") params.set("dir", sortDirection);
    else params.delete("dir");

    const nextQuery = params.toString();
    const next = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const current = searchParams.toString() ? `${pathname}?${searchParams.toString()}` : pathname;
    if (next === current) return;
    router.replace(next, { scroll: false });
  }, [backendPage, pathname, placeQuery, query, router, searchParams, sortDirection, sortField]);

  useEffect(() => {
    if (!hydratedFromUrlRef.current) return;
    setBackendPage(1);
  }, [normalizedPlaceQuery, normalizedQuery]);

  const inventoryQuery = useQuery({
    queryKey: ["inventory-rows", backendPageSize],
    queryFn: async () => {
      const first = await fetchInventoryRows({ page: 1, pageSize: 200 });
      if (Array.isArray(first)) {
        return first;
      }

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
    if (!payload) {
      return;
    }

    const items: KidDto[] = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as { results?: KidDto[] }).results)
        ? ((payload as { results?: KidDto[] }).results ?? [])
        : [];
    const mappedRows = items.map((item) => {
      const photos = normalizePhotoList(item.photo);
      return {
        id: item.id,
        kidNumber: item.kid_number ?? "-",
        kidAccount: item.kid_account?.trim() || "-",
        kidId: item.kid_id,
        orderDbId: item.order_db_id ?? null,
        entity: item.entity,
        place: normalizePlaceValue(item.place),
        room: item.room?.trim() || "-",
        furnitureType: item.type?.trim() || "-",
        parentOrderId: item.parent_order_id?.trim() || "-",
        additionalOrderIds: item.additional_order_ids_text?.trim() || "-",
        platform: item.platform?.trim() || "-",
        quantity: typeof item.quantity === "number" ? String(item.quantity) : "-",
        title: item.title || "-",
        memo: item.memo?.trim() || "-",
        sku: item.sku?.trim() || "-",
        globalPrice: item.global_price?.trim() || "-",
        status: item.status || "no_paid",
        date: formatDate(item.date),
        photo: getPrimaryPhoto(item.photo),
        photos,
        photoCount: String(item.photo_count ?? photos.length)
      };
    });

    setRows(mappedRows);
    setTotalCount(mappedRows.length);
    setExpandedRowId(null);
  }, [inventoryQuery.data]);

  const filteredRows = useMemo(() => {
    const normalizedQueryLower = normalizedQuery.toLowerCase();
    const normalizedPlaceLower = normalizedPlaceQuery.toLowerCase();
    if (!normalizedQueryLower && !normalizedPlaceLower) {
      return rows;
    }
    const kidOrderTokens = normalizedQueryLower
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
    const placeTokens = normalizedPlaceLower
      .split(/\s+/)
      .map((token) => token.trim())
      .filter((token) => token.length > 0);

    return rows.filter((row) => {
      const kidOrderPair = `${row.kidNumber}:${row.parentOrderId}`.toLowerCase();
      const kidOrderPairSpaced = `${row.kidNumber} : ${row.parentOrderId}`.toLowerCase();
      const kidOrderSearchable = [
        row.kidId.toString(),
        row.kidNumber,
        row.parentOrderId,
        row.additionalOrderIds,
        row.kidAccount,
        kidOrderPair,
        kidOrderPairSpaced
      ]
        .join(" ")
        .toLowerCase();
      const placeSearchable = row.place.toLowerCase();
      const matchesKidOrder =
        kidOrderTokens.length === 0 || kidOrderTokens.every((token) => kidOrderSearchable.includes(token));
      const matchesPlace =
        placeTokens.length === 0 || placeTokens.every((token) => placeSearchable.includes(token));
      return matchesKidOrder && matchesPlace;
    });
  }, [rows, normalizedPlaceQuery, normalizedQuery]);

  const kidOrderOptions = useMemo(() => {
    const options = rows
      .map((row) => `${row.kidNumber.trim()} : ${row.parentOrderId.trim()}`)
      .map((value) => value.trim())
      .filter((value) => value.length > 1 && !value.startsWith("- :") && !value.endsWith(": -"));
    return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [rows]);

  const placeOptions = useMemo(() => {
    const options = rows
      .map((row) => row.place.trim())
      .filter((value) => value.length > 0 && value !== "-");
    return Array.from(new Set(options)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }, [rows]);

  const visibleKidOrderOptions = useMemo(() => {
    const normalized = kidOrderFilterSearch.trim().toLowerCase();
    if (!normalized) return kidOrderOptions;
    return kidOrderOptions.filter((option) => option.toLowerCase().includes(normalized));
  }, [kidOrderFilterSearch, kidOrderOptions]);

  const visiblePlaceOptions = useMemo(() => {
    const normalized = placeFilterSearch.trim().toLowerCase();
    if (!normalized) return placeOptions;
    return placeOptions.filter((option) => option.toLowerCase().includes(normalized));
  }, [placeFilterSearch, placeOptions]);

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
      if (sortField === "id") {
        order = collator.compare(String(left.kidId), String(right.kidId));
      } else if (sortField === "place") {
        order = collator.compare(left.place.trim(), right.place.trim());
      } else if (sortField === "qty") {
        order = Number(left.quantity) - Number(right.quantity);
      } else if (sortField === "globalPrice") {
        const l = parsePrice(left.globalPrice);
        const r = parsePrice(right.globalPrice);
        order = Number.isFinite(l) && Number.isFinite(r) ? l - r : collator.compare(left.globalPrice, right.globalPrice);
      } else if (sortField === "status") {
        order = collator.compare(left.status, right.status);
      } else if (sortField === "date") {
        const l = parseDateValue(left.date);
        const r = parseDateValue(right.date);
        order = Number.isFinite(l) && Number.isFinite(r) ? l - r : collator.compare(left.date, right.date);
      }
      if (order === 0) {
        order = collator.compare(String(left.kidId), String(right.kidId));
      }
      return sortDirection === "asc" ? order : -order;
    });
    return sortable;
  }, [filteredRows, sortDirection, sortField]);

  function toggleSort(field: "id" | "place" | "qty" | "globalPrice" | "status" | "date") {
    if (sortField === field) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortField(field);
    setSortDirection("asc");
  }

  function sortIcon(field: "id" | "place" | "qty" | "globalPrice" | "status" | "date") {
    if (sortField !== field) return <ArrowUpDown size={12} className="ui-sort-bump" />;
    return sortDirection === "asc" ? <ArrowUp size={12} className="ui-sort-bump" /> : <ArrowDown size={12} className="ui-sort-bump" />;
  }

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / backendPageSize));
  const hasPrevPage = backendPage > 1;
  const hasNextPage = backendPage < totalPages;
  const paginatedRows = sortedRows.slice((backendPage - 1) * backendPageSize, backendPage * backendPageSize);
  const shouldVirtualize = false;
  const { startIndex, endIndex, topSpacerHeight, bottomSpacerHeight } = useVirtualRows({
    rowCount: paginatedRows.length,
    rowHeight: 84,
    viewportHeight: tableViewportHeight,
    scrollTop: tableScrollTop,
    enabled: shouldVirtualize
  });
  const visibleRows = shouldVirtualize ? paginatedRows.slice(startIndex, endIndex + 1) : paginatedRows;
  const allVisibleSelected = visibleRows.length > 0 && visibleRows.every((row) => selectedRowIds.has(row.id));
  const pageNumbers = (() => {
    const start = Math.max(1, backendPage - 2);
    const end = Math.min(totalPages, start + 4);
    const adjustedStart = Math.max(1, end - 4);
    return Array.from({ length: end - adjustedStart + 1 }, (_, index) => adjustedStart + index);
  })();

  useEffect(() => {
    if (backendPage > totalPages) {
      setBackendPage(totalPages);
    }
  }, [backendPage, totalPages]);

  useEffect(() => {
    if (tableViewportHeight > 0) return;
    if (typeof window === "undefined") return;
    setTableViewportHeight(Math.max(320, Math.floor(window.innerHeight * 0.68)));
  }, [tableViewportHeight]);

  useEffect(() => {
    const node = tableWrapRef.current;
    if (!node) {
      return;
    }

    function applyByWidth(width: number) {
      setVisibleColumns((current) => {
        const next = getVisibleColumnsByWidth(width);
        if (
          current.date === next.date &&
          current.place === next.place &&
          current.platform === next.platform &&
          current.quantity === next.quantity
        ) {
          return current;
        }
        return next;
      });
    }

    applyByWidth(node.clientWidth);
    setTableViewportHeight(node.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      applyByWidth(entry.contentRect.width);
      setTableViewportHeight(entry.contentRect.height);
    });
    observer.observe(node);

    return () => {
      observer.disconnect();
    };
  }, []);

  const visibleColumnCount =
    8 +
    (visibleColumns.date ? 1 : 0) +
    (visibleColumns.place ? 1 : 0) +
    (visibleColumns.platform ? 1 : 0) +
    (visibleColumns.quantity ? 1 : 0);

  async function handleDeleteRow(row: InventoryRow) {
    if (deletingRowId) {
      return;
    }

    const label = `kid ${row.kidNumber}`;
    const shouldDelete = window.confirm(`${t.delete} ${label} and all related orders?`);
    if (!shouldDelete) {
      return;
    }

    setDeletingRowId(row.id);
    try {
      await deleteInventoryEntity({
        entity: row.entity,
        orderDbId: row.orderDbId,
        kidId: row.kidId
      });
      await inventoryQuery.refetch();
      setSelectedRowIds((current) => {
        const next = new Set(current);
        next.delete(row.id);
        return next;
      });
      if (expandedRowId === row.id) {
        setExpandedRowId(null);
      }
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
        if (expandedRowId === row.id) {
          setExpandedRowId(null);
        }
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
        searchPlaceholder="Search by KID / Order"
        filtersSlot={
          <div className="flex flex-wrap items-center gap-2">
            <AddProductButton onCreated={() => inventoryQuery.refetch()} />
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 min-w-[220px] justify-between gap-2 truncate border-[#d7dee8] bg-white focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  >
                    <span className="truncate">{query ? `KID / ORDER: ${query}` : "Filter KID / ORDER"}</span>
                    {query ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Clear KID / ORDER filter"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-high)] hover:text-[color:var(--text-primary)]"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setQuery("");
                          setKidOrderFilterSearch("");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            setQuery("");
                            setKidOrderFilterSearch("");
                          }
                        }}
                      >
                        <X size={12} />
                      </span>
                    ) : null}
                  </Button>
                }
              />
              <DropdownMenuContent className="w-[320px] rounded-xl border border-[#d7dee8] bg-white p-1.5 shadow-lg ring-0 outline-none focus:outline-none focus-visible:outline-none">
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
                    <input
                      value={kidOrderFilterSearch}
                      onChange={(event) => setKidOrderFilterSearch(event.target.value)}
                      placeholder="Type to search..."
                      className="h-9 w-full rounded-lg border border-[#d7dee8] bg-white pl-10 pr-3 text-sm text-[color:var(--text-primary)] placeholder:text-[13px] placeholder:text-[color:var(--text-muted)] focus:border-[#b7c6d8] focus:outline-none"
                    />
                  </div>
                  <div className="max-h-64 overflow-auto rounded-lg border border-[color:var(--outline)] p-1 focus:outline-none">
                    <DropdownMenuItem onSelect={() => setQuery("")} onClick={() => setQuery("")}>All KID / ORDER</DropdownMenuItem>
                    {visibleKidOrderOptions.map((option) => (
                      <DropdownMenuItem key={`kid-order-filter-${option}`} onSelect={() => setQuery(option)} onClick={() => setQuery(option)}>
                        {option}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 min-w-[180px] justify-between gap-2 truncate border-[#d7dee8] bg-white focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  >
                    <span className="truncate">{placeQuery ? `PLACE: ${placeQuery}` : "Filter Place"}</span>
                    {placeQuery ? (
                      <span
                        role="button"
                        tabIndex={0}
                        aria-label="Clear place filter"
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[color:var(--text-muted)] transition hover:bg-[color:var(--surface-high)] hover:text-[color:var(--text-primary)]"
                        onPointerDown={(event) => {
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.stopPropagation();
                        }}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setPlaceQuery("");
                          setPlaceFilterSearch("");
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            event.stopPropagation();
                            setPlaceQuery("");
                            setPlaceFilterSearch("");
                          }
                        }}
                      >
                        <X size={12} />
                      </span>
                    ) : null}
                  </Button>
                }
              />
              <DropdownMenuContent className="w-[280px] rounded-xl border border-[#d7dee8] bg-white p-1.5 shadow-lg ring-0 outline-none focus:outline-none focus-visible:outline-none">
                <div className="space-y-1.5">
                  <div className="relative">
                    <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
                    <input
                      value={placeFilterSearch}
                      onChange={(event) => setPlaceFilterSearch(event.target.value)}
                      placeholder="Type to search..."
                      className="h-9 w-full rounded-lg border border-[#d7dee8] bg-white pl-10 pr-3 text-sm text-[color:var(--text-primary)] placeholder:text-[13px] placeholder:text-[color:var(--text-muted)] focus:border-[#b7c6d8] focus:outline-none"
                    />
                  </div>
                  <div className="max-h-64 overflow-auto rounded-lg border border-[color:var(--outline)] p-1 focus:outline-none">
                    <DropdownMenuItem onSelect={() => setPlaceQuery("")} onClick={() => setPlaceQuery("")}>All places</DropdownMenuItem>
                    {visiblePlaceOptions.map((option) => (
                      <DropdownMenuItem key={`place-filter-${option}`} onSelect={() => setPlaceQuery(option)} onClick={() => setPlaceQuery(option)}>
                        {option}
                      </DropdownMenuItem>
                    ))}
                  </div>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
            : filteredRows.map((row) => (
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
                      <p className="truncate text-xs text-[color:var(--text-secondary)]">{t.order}: {highlightText(row.parentOrderId, query)}</p>
                      <p className="truncate text-xs text-[color:var(--text-secondary)]">{t.place}: {highlightText(row.place, query)}</p>
                      <p className="truncate text-xs text-[color:var(--text-secondary)]">{t.type}: {highlightText(row.furnitureType, query)}</p>
                      <p className="truncate text-xs text-[color:var(--text-secondary)]">{t.qty}: {highlightText(row.quantity, query)} | {t.status}: {highlightText(row.status, query)}</p>
                    </div>
                  </div>
                </div>
              ))}
          {!loading && filteredRows.length === 0 ? (
            <EmptyState
              compact
              variant="inventory"
              title="No inventory matches"
              message="Try another search query or clear current filters."
              actionLabel={query.trim() ? t.clearSearch : undefined}
              onAction={query.trim() ? () => setQuery("") : undefined}
            />
          ) : null}
        </div>
        <div className="wh-sofort-table-shell">
          <div className="wh-sofort-table-frame">
            <div
              ref={tableWrapRef}
              className="wh-inventory-table-wrap ui-desktop-rhythm-table hidden max-w-full overflow-visible px-0 pb-0 pt-0 md:block"
            >
              <table className="ui-listing-table wh-inventory-data-table w-full min-w-[1460px] border-separate border-spacing-y-0 text-left text-sm">
                <thead>
                  <tr className="ui-table-head-row sticky top-0 z-10">
                <th scope="col" className="ui-listing-head-cell ui-listing-sticky-col ui-listing-sticky-head w-[44px] px-2 py-3 text-center" style={{ left: 0 }}>
                  <Checkbox
                    checked={allVisibleSelected}
                    onCheckedChange={() =>
                      setSelectedRowIds((current) => {
                        const next = new Set(current);
                        if (allVisibleSelected) {
                          visibleRows.forEach((row) => next.delete(row.id));
                        } else {
                          visibleRows.forEach((row) => next.add(row.id));
                        }
                        return next;
                      })
                    }
                    aria-label="Select visible rows"
                  />
                </th>
                <th scope="col" className="ui-listing-head-cell ui-listing-sticky-col ui-listing-sticky-head w-[90px] px-3 py-3" style={{ left: 44 }}>
                  <button type="button" onClick={() => toggleSort("id")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                    <span className="ui-table-head-label">{t.id}</span>
                    {sortIcon("id")}
                  </button>
                </th>
                <th scope="col" className="ui-listing-head-cell ui-listing-sticky-col ui-listing-sticky-head w-[170px] px-3 py-3 text-center" style={{ left: 134 }}><span className="ui-table-head-label">IMAGE</span></th>
                <th scope="col" className="ui-listing-head-cell ui-listing-sticky-col ui-listing-sticky-head w-[250px] px-3 py-3" style={{ left: 304 }}><span className="ui-table-head-label">{t.kidOrder}</span></th>
                <th scope="col" className={`${visibleColumns.place ? "table-cell" : "hidden"} ui-listing-head-cell w-[110px] px-3 py-3`}>
                  <button type="button" onClick={() => toggleSort("place")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                    <span className="ui-table-head-label">{t.place}</span>
                    {sortIcon("place")}
                  </button>
                </th>
                <th scope="col" className={`${visibleColumns.platform ? "table-cell" : "hidden"} ui-listing-head-cell w-[130px] px-3 py-3`}><span className="ui-table-head-label">{t.platform}</span></th>
                <th scope="col" className={`${visibleColumns.quantity ? "table-cell" : "hidden"} ui-listing-head-cell w-[84px] px-3 py-3`}>
                  <button type="button" onClick={() => toggleSort("qty")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                    <span className="ui-table-head-label">{t.qty}</span>
                    {sortIcon("qty")}
                  </button>
                </th>
                <th scope="col" className="ui-listing-head-cell w-[320px] px-3 py-3"><span className="ui-table-head-label">{t.title}</span></th>
                <th scope="col" className="ui-listing-head-cell w-[140px] px-3 py-3">
                  <button type="button" onClick={() => toggleSort("globalPrice")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                    <span className="ui-table-head-label">{t.globalPrice}</span>
                    {sortIcon("globalPrice")}
                  </button>
                </th>
                <th scope="col" className="ui-listing-head-cell w-[120px] px-3 py-3">
                  <button type="button" onClick={() => toggleSort("status")} className="focus-ring inline-flex items-center gap-1 rounded-xl px-1 py-0.5 transition hover:bg-[color:rgba(129,135,255,0.14)]">
                    <span className="ui-table-head-label">{t.status}</span>
                    {sortIcon("status")}
                  </button>
                </th>
                <th scope="col" className={`${visibleColumns.date ? "table-cell" : "hidden"} ui-listing-head-cell w-[130px] px-3 py-3`}>
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
                    rows={visibleRows}
                    filteredCount={filteredRows.length}
                    visibleColumns={visibleColumns}
                    expandedRowId={expandedRowId}
                    deletingRowId={deletingRowId}
                    visibleColumnCount={visibleColumnCount}
                    rowIndexOffset={shouldVirtualize ? startIndex : 0}
                    topSpacerHeight={shouldVirtualize ? (tableScrollTop <= 1 ? 0 : topSpacerHeight) : 0}
                    bottomSpacerHeight={shouldVirtualize ? bottomSpacerHeight : 0}
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
                    onToggleRow={(rowId) => setExpandedRowId((current) => (current === rowId ? null : rowId))}
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
            <button
              type="button"
              className="ui-button ui-button-ghost h-8 rounded-xl px-3"
              onClick={() => setBackendPage(1)}
              disabled={!hasPrevPage}
            >
              First
            </button>
            <button
              type="button"
              className="ui-button ui-button-ghost h-8 rounded-xl px-3"
              onClick={() => setBackendPage((page) => Math.max(1, page - 1))}
              disabled={!hasPrevPage}
            >
              Prev
            </button>
            <div className="inline-flex items-center gap-1">
              {pageNumbers.map((page) => (
                <button
                  key={`inventory-page-${page}`}
                  type="button"
                  onClick={() => setBackendPage(page)}
                  className={`h-8 min-w-8 rounded-lg px-2 text-sm ${
                    page === backendPage
                      ? "bg-[color:var(--primary)] text-white"
                      : "border border-[color:var(--outline)] bg-white text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-high)]"
                  }`}
                >
                  {page}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ui-button ui-button-ghost h-8 rounded-xl px-3"
              onClick={() => setBackendPage((page) => page + 1)}
              disabled={!hasNextPage}
            >
              Next
            </button>
            <button
              type="button"
              className="ui-button ui-button-ghost h-8 rounded-xl px-3"
              onClick={() => setBackendPage(totalPages)}
              disabled={!hasNextPage}
            >
              Last
            </button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}


