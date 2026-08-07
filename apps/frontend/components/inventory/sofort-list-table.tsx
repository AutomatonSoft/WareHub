"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useLabels } from "../../app/use-labels";
import { PLACEHOLDER_EAN } from "./ean-utils";
import { trackLatency, trackUiError } from "../../app/telemetry";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { ErrorState } from "../ui/error-state";
import { AddProductButton } from "./add-item-button";
import { ImportKidGreenButton } from "./import-kid-green-button";
import { deleteInventoryEntity, fetchInventoryFilterOptions, fetchInventoryRows } from "./inventory-api";
import { getPrimaryPhoto, normalizePhotoList, normalizePlaceValue } from "./inventory-table-utils";
import { resolveMarketplaceActive } from "./sofort-list/sofort-list-jv-status";
import { SofortListEmptyState } from "./sofort-list/sofort-list-empty-state";
import { SofortListErrorState } from "./sofort-list/sofort-list-error-state";
import { SofortListLoadingState } from "./sofort-list/sofort-list-loading-state";
import { SofortListPagination } from "./sofort-list/sofort-list-pagination";
import { SofortListTableShell } from "./sofort-list/sofort-list-table-shell";
import { SofortListToolbar } from "./sofort-list/sofort-list-toolbar";
import type { SofortListRow } from "./sofort-list/sofort-list-types";
import { useToast } from "../shared/toast-provider";

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
  const { showToast } = useToast();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const placeholderEan = PLACEHOLDER_EAN;

  const [rows, setRows] = useState<SofortListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [placeFilter, setPlaceFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("all");
  const [quantityFilter, setQuantityFilter] = useState("");
  const [roomFilter, setRoomFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [colorFilter, setColorFilter] = useState("");
  const [materialFilter, setMaterialFilter] = useState("");
  const [bWareOnlyFilter, setBWareOnlyFilter] = useState(false);
  const [inTransitOnlyFilter, setInTransitOnlyFilter] = useState(false);
  const [backendPage, setBackendPage] = useState(1);
  const [backendPageSize, setBackendPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [hasPrevPage, setHasPrevPage] = useState(false);
  const [urlHydrated, setUrlHydrated] = useState(false);
  const [selectedRows, setSelectedRows] = useState<SofortListRow[]>([]);
  const [selectionResetKey, setSelectionResetKey] = useState(0);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const fetchStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    if (urlHydrated) return;
    const pageParam = Number.parseInt(searchParams.get("page") ?? "1", 10);
    const pageSizeParam = Number.parseInt(searchParams.get("page_size") ?? "20", 10);
    setQuery(searchParams.get("q") ?? "");
    setPlaceFilter(searchParams.get("place") ?? "");
    setSectionFilter(searchParams.get("section") ?? "");
    setLocationFilter(searchParams.get("location") ?? "all");
    setQuantityFilter(searchParams.get("quantity") ?? "");
    setRoomFilter(searchParams.get("room") ?? "");
    setTypeFilter(searchParams.get("type") ?? "");
    setCompanyFilter(searchParams.get("company") ?? "");
    setColorFilter(searchParams.get("color") ?? "");
    setMaterialFilter(searchParams.get("material") ?? "");
    setBWareOnlyFilter(searchParams.get("b_ware") === "true");
    setInTransitOnlyFilter(searchParams.get("in_transit") === "true");
    setBackendPage(Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1);
    setBackendPageSize(Number.isFinite(pageSizeParam) && pageSizeParam > 0 ? pageSizeParam : 20);
    setUrlHydrated(true);
  }, [searchParams, urlHydrated]);

  useEffect(() => {
    if (!urlHydrated) return;
    const params = new URLSearchParams(window.location.search);
    const normalizedQuery = query.trim();
    if (normalizedQuery) params.set("q", normalizedQuery);
    else params.delete("q");
    if (placeFilter.trim()) params.set("place", placeFilter.trim());
    else params.delete("place");
    if (sectionFilter.trim()) params.set("section", sectionFilter.trim());
    else params.delete("section");
    if (locationFilter !== "all") params.set("location", locationFilter);
    else params.delete("location");
    if (quantityFilter.trim()) params.set("quantity", quantityFilter.trim());
    else params.delete("quantity");
    if (roomFilter.trim()) params.set("room", roomFilter.trim());
    else params.delete("room");
    if (typeFilter.trim()) params.set("type", typeFilter.trim());
    else params.delete("type");
    if (companyFilter.trim()) params.set("company", companyFilter.trim());
    else params.delete("company");
    if (colorFilter.trim()) params.set("color", colorFilter.trim());
    else params.delete("color");
    if (materialFilter.trim()) params.set("material", materialFilter.trim());
    else params.delete("material");
    if (bWareOnlyFilter) params.set("b_ware", "true");
    else params.delete("b_ware");
    if (inTransitOnlyFilter) params.set("in_transit", "true");
    else params.delete("in_transit");
    params.delete("sort");
    params.delete("dir");
    if (backendPage > 1) params.set("page", String(backendPage));
    else params.delete("page");
    if (backendPageSize !== 20) params.set("page_size", String(backendPageSize));
    else params.delete("page_size");
    const nextQuery = params.toString();
    const next = nextQuery ? `${pathname}?${nextQuery}` : pathname;
    const current = `${window.location.pathname}${window.location.search}`;
    if (next !== current) window.history.replaceState(window.history.state, "", next);
  }, [
    backendPage,
    backendPageSize,
    bWareOnlyFilter,
    colorFilter,
    companyFilter,
    inTransitOnlyFilter,
    locationFilter,
    materialFilter,
    pathname,
    placeFilter,
    query,
    quantityFilter,
    roomFilter,
    sectionFilter,
    typeFilter,
    urlHydrated,
  ]);

  const normalizedServerQuery = query.trim();
  const serverPlaceSort: "asc" | "desc" = "asc";
  const serverPlace = placeFilter.trim() || undefined;
  const serverSection = sectionFilter.trim() || undefined;
  const serverLocation = locationFilter === "warehouse" || locationFilter === "store" ? locationFilter : undefined;
  const serverQuantity = quantityFilter.trim() || undefined;
  const serverRoom = roomFilter.trim() || undefined;
  const serverType = typeFilter.trim() || undefined;
  const serverCompany = companyFilter.trim() || undefined;
  const serverColor = colorFilter.trim() || undefined;
  const serverMaterial = materialFilter.trim() || undefined;

  const sofortListQuery = useQuery({
    queryKey: [
      "sofort-list-rows",
      backendPage,
      backendPageSize,
      normalizedServerQuery,
      serverPlaceSort,
      serverPlace,
      serverSection,
      serverLocation,
      serverQuantity,
      serverRoom,
      serverType,
      serverCompany,
      serverColor,
      serverMaterial,
      bWareOnlyFilter,
      inTransitOnlyFilter,
    ],
    queryFn: () =>
      fetchInventoryRows({
        page: backendPage,
        pageSize: backendPageSize,
        q: normalizedServerQuery || undefined,
        place: serverPlace,
        section: serverSection,
        location: serverLocation,
        quantity: serverQuantity,
        placeSort: serverPlaceSort,
        room: serverRoom,
        type: serverType,
        company: serverCompany,
        color: serverColor,
        material: serverMaterial,
        bWare: bWareOnlyFilter,
        inTransit: inTransitOnlyFilter,
      }),
    placeholderData: keepPreviousData,
  });

  const filterOptionsQuery = useQuery({
    queryKey: ["sofort-list-filter-options"],
    queryFn: fetchInventoryFilterOptions,
    staleTime: 60_000,
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
    setError(sofortListQuery.error instanceof Error ? sofortListQuery.error.message : t.failedLoadInventory);
  }, [backendPage, sofortListQuery.error, t.failedLoadInventory]);

  useEffect(() => {
    const payload = sofortListQuery.data;
    if (!payload) return;
    const items = Array.isArray(payload) ? payload : Array.isArray(payload.results) ? payload.results : [];
    const mappedRows = items.map((item) => {
      const rawItem = item as Record<string, unknown>;
      const rawStatus = typeof rawItem.ean_status === "object" && rawItem.ean_status !== null
        ? (rawItem.ean_status as Record<string, unknown>)
        : {};
      const photos = normalizePhotoList(item.photo);
      const siteEans = extractSiteEans(rawItem, "");
      const isBWare = rawItem.b_ware === true;
      const normalizedRowEan =
        typeof (item as { database_ean?: unknown }).database_ean === "string" && (item as { database_ean?: string }).database_ean?.trim()
          ? (item as { database_ean?: string }).database_ean!.trim()
          : typeof (item as { main_ean?: unknown }).main_ean === "string" && (item as { main_ean?: string }).main_ean?.trim()
            ? (item as { main_ean?: string }).main_ean!.trim()
            : "";

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
      const normalizedSiteEanStatuses = {
        jv: typeof rawStatus.jv === "boolean" ? rawStatus.jv : null,
        xl: typeof rawStatus.xl === "boolean" ? rawStatus.xl : null,
        ottoJv: typeof rawStatus.otto_jv === "boolean" ? rawStatus.otto_jv : null,
        ottoXl: typeof rawStatus.otto_xl === "boolean" ? rawStatus.otto_xl : null,
        ebayJv: typeof rawStatus.ebay_jv === "boolean" ? rawStatus.ebay_jv : null,
        ebayXl: typeof rawStatus.ebay_xl === "boolean" ? rawStatus.ebay_xl : null,
        kauflandJv: typeof rawStatus.kaufland_jv === "boolean" ? rawStatus.kaufland_jv : null,
        kauflandXl: typeof rawStatus.kaufland_xl === "boolean" ? rawStatus.kaufland_xl : null,
        hoodJv: typeof rawStatus.hood_jv === "boolean" ? rawStatus.hood_jv : null,
        hoodXl: typeof rawStatus.hood_xl === "boolean" ? rawStatus.hood_xl : null
      };
      const marketplaceActive = resolveMarketplaceActive(rawItem);

      return {
        id: item.id,
        kidId: item.kid_id,
        orderDbId: typeof item.order_db_id === "number" && Number.isFinite(item.order_db_id) ? item.order_db_id : null,
        kidNumber: item.kid_number ?? "-",
        ean: normalizedRowEan,
        siteEans: normalizedSiteEans,
        siteEanStatuses: normalizedSiteEanStatuses,
        photo: getPrimaryPhoto(item.photo),
        photoUrls: photos,
        photoCount: item.photo_count ?? photos.length,
        place: normalizePlaceValue(item.place),
        section: typeof rawItem.section === "string" && rawItem.section.trim().length > 0 ? rawItem.section.trim() : null,
        bWare: isBWare,
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
        marketplaceActive,
      } satisfies SofortListRow;
    });

    setRows(mappedRows);
    if (Array.isArray(payload)) {
      setTotalCount(mappedRows.length);
      setHasNextPage(false);
      setHasPrevPage(backendPage > 1);
    } else {
      setTotalCount(typeof payload.count === "number" && Number.isFinite(payload.count) ? payload.count : mappedRows.length);
      setHasNextPage(Boolean(payload.next));
      setHasPrevPage(Boolean(payload.previous));
    }
  }, [backendPage, placeholderEan, sofortListQuery.data]);

  const sortedRows = rows;
  const selectedVisibleCount = selectedRows.length;
  const hasSelectedActiveMarketplace = useMemo(
    () => selectedRows.some((row) => row.marketplaceActive === true),
    [selectedRows],
  );
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / backendPageSize)), [backendPageSize, totalCount]);
  const fallbackPlaceOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.place.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);
  const fallbackSectionOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.section?.trim() ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);
  const fallbackQuantityOptions = useMemo(() => Array.from(new Set(rows.map((row) => String(row.quantity)).filter(Boolean))).sort((a, b) => Number.parseInt(a, 10) - Number.parseInt(b, 10)), [rows]);
  const fallbackRoomOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.room?.trim() ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);
  const fallbackTypeOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.furnitureType?.trim() ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);
  const fallbackCompanyOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.company?.trim() ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);
  const fallbackColorOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.color?.trim() ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);
  const fallbackMaterialOptions = useMemo(() => Array.from(new Set(rows.map((row) => row.material?.trim() ?? "").filter(Boolean))).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })), [rows]);
  const placeOptions = filterOptionsQuery.data?.places ?? fallbackPlaceOptions;
  const sectionOptions = filterOptionsQuery.data?.sections ?? fallbackSectionOptions;
  const quantityOptions = filterOptionsQuery.data?.quantities ?? fallbackQuantityOptions;
  const roomOptions = filterOptionsQuery.data?.rooms ?? fallbackRoomOptions;
  const typeOptions = filterOptionsQuery.data?.types ?? fallbackTypeOptions;
  const companyOptions = filterOptionsQuery.data?.companies ?? fallbackCompanyOptions;
  const colorOptions = filterOptionsQuery.data?.colors ?? fallbackColorOptions;
  const materialOptions = filterOptionsQuery.data?.materials ?? fallbackMaterialOptions;
  const activeFilters = useMemo(
    () =>
      [
        placeFilter.trim() ? { key: "place", label: t.place, value: placeFilter.trim() } : null,
        sectionFilter.trim() ? { key: "section", label: t.section, value: sectionFilter.trim() } : null,
        locationFilter !== "all"
          ? { key: "location", label: t.location, value: locationFilter === "warehouse" ? t.warehouse : t.store }
          : null,
        quantityFilter.trim() ? { key: "quantity", label: t.quantity, value: quantityFilter.trim() } : null,
        roomFilter.trim() ? { key: "room", label: t.room, value: roomFilter.trim() } : null,
        typeFilter.trim() ? { key: "type", label: t.type, value: typeFilter.trim() } : null,
        companyFilter.trim() ? { key: "company", label: t.company, value: companyFilter.trim() } : null,
        colorFilter.trim() ? { key: "color", label: t.color, value: colorFilter.trim() } : null,
        materialFilter.trim() ? { key: "material", label: t.material, value: materialFilter.trim() } : null,
        bWareOnlyFilter ? { key: "b_ware", label: t.bWare, value: t.selectedOnly } : null,
        inTransitOnlyFilter ? { key: "in_transit", label: t.inTransit, value: t.selectedOnly } : null,
      ].filter((item): item is { key: string; label: string; value: string } => item !== null),
    [
      colorFilter,
      companyFilter,
      bWareOnlyFilter,
      inTransitOnlyFilter,
      locationFilter,
      materialFilter,
      placeFilter,
      quantityFilter,
      roomFilter,
      sectionFilter,
      t.color,
      t.company,
      t.location,
      t.material,
      t.place,
      t.quantity,
      t.room,
      t.section,
      t.store,
      t.type,
      t.bWare,
      t.inTransit,
      t.selectedOnly,
      t.warehouse,
      typeFilter,
    ]
  );

  const hasActiveFilters =
    query.trim().length > 0 ||
    placeFilter.trim().length > 0 ||
    sectionFilter.trim().length > 0 ||
    locationFilter !== "all" ||
    quantityFilter.trim().length > 0 ||
    roomFilter.trim().length > 0 ||
    typeFilter.trim().length > 0 ||
    companyFilter.trim().length > 0 ||
    colorFilter.trim().length > 0 ||
    materialFilter.trim().length > 0 ||
    bWareOnlyFilter ||
    inTransitOnlyFilter;

  useEffect(() => {
    if (backendPage > totalPages) {
      setBackendPage(totalPages);
    }
  }, [backendPage, totalPages]);

  const updateSelectedRows = useCallback((nextRows: SofortListRow[]) => {
    setSelectedRows(nextRows);
  }, []);

  function resetFiltersAndSearch() {
    setQuery("");
    setPlaceFilter("");
    setSectionFilter("");
    setLocationFilter("all");
    setQuantityFilter("");
    setRoomFilter("");
    setTypeFilter("");
    setCompanyFilter("");
    setColorFilter("");
    setMaterialFilter("");
    setBWareOnlyFilter(false);
    setInTransitOnlyFilter(false);
    setBackendPage(1);
    setSelectedRows([]);
    setSelectionResetKey((current) => current + 1);
  }

  const updateQuery = useCallback((nextValue: string) => {
    setQuery(nextValue);
    setBackendPage(1);
  }, []);

  function updateSelectFilter(setter: (value: string) => void, value: string) {
    setter(value);
    setBackendPage(1);
  }

  function normalizeSelectValue(value: string) {
    return value === "all" ? "" : value;
  }

  function updatePageSize(nextPageSize: number) {
    setBackendPageSize(nextPageSize);
    setBackendPage(1);
  }

  function clearSingleFilter(key: string) {
    switch (key) {
      case "place":
        setPlaceFilter("");
        break;
      case "location":
        setLocationFilter("all");
        break;
      case "section":
        setSectionFilter("");
        break;
      case "quantity":
        setQuantityFilter("");
        break;
      case "room":
        setRoomFilter("");
        break;
      case "type":
        setTypeFilter("");
        break;
      case "company":
        setCompanyFilter("");
        break;
      case "color":
        setColorFilter("");
        break;
      case "material":
        setMaterialFilter("");
        break;
      case "b_ware":
        setBWareOnlyFilter(false);
        break;
      case "in_transit":
        setInTransitOnlyFilter(false);
        break;
      default:
        break;
    }
    setBackendPage(1);
  }

  const updateRowDraft = useCallback((nextRow: SofortListRow) => {
    setRows((current) => current.map((row) => (row.id === nextRow.id ? nextRow : row)));
  }, []);

  const { refetch: refetchSofortList } = sofortListQuery;
  const refreshSofortList = useCallback(() => {
    void refetchSofortList();
  }, [refetchSofortList]);

  const shellLabels = useMemo(() => ({
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
    deleteBlockedByMarketplace: t.deleteBlockedByMarketplace,
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
  }), [t]);

  async function deleteSelectedRows() {
    if (deletingSelected || selectedRows.length === 0 || hasSelectedActiveMarketplace) return;
    const confirmed = window.confirm(`Вы хотите удалить ${selectedRows.length} товаров из базы данных?`);
    if (!confirmed) return;

    const deletedPlaces = selectedRows
      .map((row) => (row.section ? `${row.section} ${row.place}` : row.place).trim())
      .filter(Boolean)
      .join(", ");

    setDeletingSelected(true);
    try {
      const results = await Promise.allSettled(
        selectedRows.map((row) => deleteInventoryEntity({ entity: "kid", orderDbId: null, kidId: row.kidId }))
      );
      const failed = results.filter((result) => result.status === "rejected");

      if (failed.length > 0) {
        const firstError = failed[0];
        const message =
          firstError.status === "rejected" && firstError.reason instanceof Error
            ? firstError.reason.message
            : t.deleteFailed;
        showToast(message, "error");
      } else {
        showToast(`Вы удалили товары: ${deletedPlaces}`, "success");
      }

      setSelectedRows([]);
      setSelectionResetKey((current) => current + 1);
      await sofortListQuery.refetch();
    } finally {
      setDeletingSelected(false);
    }
  }

  return (
    <div className="wh-sofort-page">
      {error ? <SofortListErrorState message={error} onRetry={() => void sofortListQuery.refetch()} retrying={sofortListQuery.isFetching} /> : null}
      <Card className="wh-sofort-toolbar-card wh-section-card">
        <CardContent className="wh-section-card__body">
          <SofortListToolbar
            query={query}
            queryLabel={t.search}
            searchPlaceholder={t.searchSofortPlaceholder}
            primaryAction={
              <div className="flex flex-wrap items-center gap-2">
                <ImportKidGreenButton onImported={() => sofortListQuery.refetch()} />
                <AddProductButton onCreated={() => sofortListQuery.refetch()} />
              </div>
            }
            trailingAction={
              selectedVisibleCount > 0 ? (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => void deleteSelectedRows()}
                  disabled={deletingSelected || hasSelectedActiveMarketplace}
                  title={hasSelectedActiveMarketplace ? t.deleteBlockedByMarketplace : undefined}
                >
                  {deletingSelected ? `${t.deleting} (${selectedVisibleCount})` : `${t.delete} (${selectedVisibleCount})`}
                </Button>
              ) : null
            }
            showFilters={showFilters}
            hasActiveFilters={hasActiveFilters}
            placeFilter={placeFilter}
            sectionFilter={sectionFilter}
            locationFilter={locationFilter}
            quantityFilter={quantityFilter}
            roomFilter={roomFilter}
            typeFilter={typeFilter}
            companyFilter={companyFilter}
            colorFilter={colorFilter}
            materialFilter={materialFilter}
            bWareOnlyFilter={bWareOnlyFilter}
            inTransitOnlyFilter={inTransitOnlyFilter}
            placeOptions={placeOptions}
            sectionOptions={sectionOptions}
            quantityOptions={quantityOptions}
            roomOptions={roomOptions}
            typeOptions={typeOptions}
            companyOptions={companyOptions}
            colorOptions={colorOptions}
            materialOptions={materialOptions}
            activeFilters={activeFilters}
            statusText={loading ? t.loadingRows : ""}
            onQueryChange={updateQuery}
            onToggleFilters={() => setShowFilters((current) => !current)}
            onPlaceFilterChange={(value) => updateSelectFilter(setPlaceFilter, normalizeSelectValue(value))}
            onSectionFilterChange={(value) => updateSelectFilter(setSectionFilter, normalizeSelectValue(value))}
            onLocationFilterChange={(value) => updateSelectFilter(setLocationFilter, value)}
            onQuantityFilterChange={(value) => updateSelectFilter(setQuantityFilter, normalizeSelectValue(value))}
            onRoomFilterChange={(value) => updateSelectFilter(setRoomFilter, normalizeSelectValue(value))}
            onTypeFilterChange={(value) => updateSelectFilter(setTypeFilter, normalizeSelectValue(value))}
            onCompanyFilterChange={(value) => updateSelectFilter(setCompanyFilter, normalizeSelectValue(value))}
            onColorFilterChange={(value) => updateSelectFilter(setColorFilter, normalizeSelectValue(value))}
            onMaterialFilterChange={(value) => updateSelectFilter(setMaterialFilter, normalizeSelectValue(value))}
            onBWareOnlyFilterChange={(checked) => updateSelectFilter((value) => setBWareOnlyFilter(value === "true"), checked ? "true" : "false")}
            onInTransitOnlyFilterChange={(checked) => updateSelectFilter((value) => setInTransitOnlyFilter(value === "true"), checked ? "true" : "false")}
            onClearSingleFilter={clearSingleFilter}
            onReset={resetFiltersAndSearch}
            labels={{
              allPlaces: t.allPlaces,
              allSections: t.allSections,
              allLocations: t.allLocations,
              allQuantities: t.allQuantities,
              allRooms: t.allRooms,
              allTypes: t.allTypes,
              allCompanies: t.allCompanies,
              allColors: t.allColors,
              allMaterials: t.allMaterials,
              place: t.place,
              section: t.section,
              location: t.location,
              quantity: t.quantity,
              room: t.room,
              type: t.type,
              company: t.company,
              color: t.color,
              material: t.material,
              bWare: t.bWare,
              inTransit: t.inTransit,
              warehouse: t.warehouse,
              store: t.store,
              clear: t.clear,
              filters: t.filters,
              hideFilters: t.hideFilters,
              flags: t.flags,
              noMatchesFound: t.noMatchesFound,
              searchProductsAria: t.searchProductsAria,
              actionsAria: t.sofortListActionsAria,
              filtersAria: t.sofortListFiltersAria,
              searchFilterPlaceholder: t.searchFilterPlaceholder,
              searchFilterAria: t.searchFilterAria,
              activeSuffix: t.activeSuffix,
            }}
          />
        </CardContent>
      </Card>
      {!error && !loading && sortedRows.length === 0 ? (
        <SofortListEmptyState clearLabel={t.clear} onReset={resetFiltersAndSearch} />
      ) : (
        <Card className="wh-sofort-table-card wh-section-card">
          <CardContent className="wh-section-card__body wh-sofort-table-body p-0">
            {error ? (
            <div className="wh-section-card__body--center">
              <ErrorState
                title={t.inventoryServiceUnavailableTitle}
                description={t.inventoryServiceUnavailableDescription}
                className="max-w-xl"
              />
              <Button type="button" variant="outline" onClick={() => void sofortListQuery.refetch()} disabled={sofortListQuery.isFetching}>
                {t.tryAgain}
              </Button>
            </div>
          ) : loading ? (
            <SofortListLoadingState />
          ) : (
            <>
              <SofortListTableShell
                rows={sortedRows}
                query={query}
                placeholderEan={placeholderEan}
                selectionResetKey={selectionResetKey}
                onSelectionChange={updateSelectedRows}
                onUpdateRow={updateRowDraft}
                onRefresh={refreshSofortList}
                availablePlaces={filterOptionsQuery.data?.available_places ?? []}
                occupiedPlaces={filterOptionsQuery.data?.places ?? []}
                highlightText={highlightText}
                labels={shellLabels}
              />
            </>
            )}
          </CardContent>
        </Card>
      )}
      {!error && rows.length > 0 && !loading ? (
        <SofortListPagination
          page={backendPage}
          totalPages={totalPages}
          totalCount={totalCount}
          pageSize={backendPageSize}
          pageSizeOptions={[10, 20, 50, 100]}
          hasPrevPage={hasPrevPage}
          hasNextPage={hasNextPage}
          labels={{
            rowsOnPage: t.rowsOnPage,
            total: t.total,
            previous: t.previous,
            next: t.next,
            page: t.page,
          }}
          onPageChange={setBackendPage}
          onPageSizeChange={updatePageSize}
        />
      ) : null}
    </div>
  );
}
