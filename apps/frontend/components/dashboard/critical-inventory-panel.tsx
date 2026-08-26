"use client";

import { Clock3, PackageSearch } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { useLabels, useLanguage } from "../../app/use-labels";
import { fetchDatabaseServiceWithSessionRetry } from "./dashboard-api";
import { getServicesApiBase } from "../inventory/inventory-api";
import type { SofortListRow } from "../inventory/sofort-list/sofort-list-types";
import { normalizePhotoList, normalizePlaceValue, type KidDto } from "../inventory/inventory-table-utils";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Skeleton } from "../ui/skeleton";
import { CriticalInventoryEditDialog } from "./critical-inventory-edit-dialog";

const CRITICAL_PAGE_SIZE = 10;

const CRITICAL_WEIGHTS = {
  ageVeryHigh: 24,
  ageHigh: 18,
  ageMedium: 12,
  ageLow: 7,
  missingPlace: 12,
  missingSection: 8,
  missingPhoto: 8,
  missingMainEan: 10,
  missingSitesEan: 5,
  missingOttoEan: 4,
  missingEbayEan: 4,
  missingKauflandEan: 4,
  missingHoodEan: 4,
  missingPrice: 9,
  missingQuantity: 9,
  missingRoom: 3,
  missingType: 3,
  missingCompany: 3,
  missingColor: 2,
  missingSize: 2,
  missingMaterial: 2,
  missingCommentary: 2,
  missingAccount: 1,
  missingDate: 8,
} as const;

const CRITICAL_SCORE_MAX =
  CRITICAL_WEIGHTS.ageVeryHigh +
  CRITICAL_WEIGHTS.missingPlace +
  CRITICAL_WEIGHTS.missingSection +
  CRITICAL_WEIGHTS.missingPhoto +
  CRITICAL_WEIGHTS.missingMainEan +
  CRITICAL_WEIGHTS.missingSitesEan +
  CRITICAL_WEIGHTS.missingOttoEan +
  CRITICAL_WEIGHTS.missingEbayEan +
  CRITICAL_WEIGHTS.missingKauflandEan +
  CRITICAL_WEIGHTS.missingHoodEan +
  CRITICAL_WEIGHTS.missingPrice +
  CRITICAL_WEIGHTS.missingQuantity +
  CRITICAL_WEIGHTS.missingRoom +
  CRITICAL_WEIGHTS.missingType +
  CRITICAL_WEIGHTS.missingCompany +
  CRITICAL_WEIGHTS.missingColor +
  CRITICAL_WEIGHTS.missingSize +
  CRITICAL_WEIGHTS.missingMaterial +
  CRITICAL_WEIGHTS.missingCommentary +
  CRITICAL_WEIGHTS.missingAccount;

type CriticalInventorySourceRow = KidDto & {
  kid_account?: string | null;
  b_ware?: boolean | null;
  stock_status?: "in_stock" | "returned" | "out" | boolean | null;
  in_transit?: boolean | null;
  commentary?: string | null;
  company?: string | null;
  color?: string | null;
  size?: string | null;
  material?: string | null;
  price?: string | null;
  global_price?: string | null;
  main_ean_jv?: string | null;
  main_ean_xl?: string | null;
  ean?: string | null;
  section?: string | null;
  room?: string | null;
  type?: string | null;
  jv_ean?: string | null;
  ean_jv?: string | null;
  jv_site_ean?: string | null;
  jvSiteEan?: string | null;
  xl_ean?: string | null;
  ean_xl?: string | null;
  xl_site_ean?: string | null;
  xlSiteEan?: string | null;
  otto_jv_ean?: string | null;
  otto_ean_jv?: string | null;
  ean_otto_jv?: string | null;
  ottoJvEan?: string | null;
  otto_xl_ean?: string | null;
  otto_ean_xl?: string | null;
  ean_otto_xl?: string | null;
  ottoXlEan?: string | null;
  ebay_jv_ean?: string | null;
  ebay_ean_jv?: string | null;
  ean_ebay_jv?: string | null;
  ebayJvEan?: string | null;
  ebay_xl_ean?: string | null;
  ebay_ean_xl?: string | null;
  ean_ebay_xl?: string | null;
  ebayXlEan?: string | null;
  kaufland_jv_ean?: string | null;
  kfl_jv_ean?: string | null;
  ean_kaufland_jv?: string | null;
  kauflandJvEan?: string | null;
  kaufland_xl_ean?: string | null;
  kfl_xl_ean?: string | null;
  ean_kaufland_xl?: string | null;
  kauflandXlEan?: string | null;
  hood_jv_ean?: string | null;
  ean_hood_jv?: string | null;
  hoodJvEan?: string | null;
  hood_xl_ean?: string | null;
  ean_hood_xl?: string | null;
  hoodXlEan?: string | null;
};

type CriticalReason = {
  key: string;
  label: string;
  weight: number;
};

type CriticalInventoryItem = {
  id: string;
  kidNumber: string;
  place: string;
  photoUrl: string | null;
  editRow: SofortListRow;
  score: number;
  daysInWarehouse: number | null;
  reasons: CriticalReason[];
};

type CriticalInventoryResponse = { results: CriticalInventorySourceRow[]; available_places: string[]; occupied_places: string[] };

function hasText(value: unknown): boolean {
  return typeof value === "string" ? value.trim().length > 0 : value !== null && value !== undefined;
}

function parseDaysInWarehouse(value?: string | null): number | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = Date.now() - date.getTime();
  return diff >= 0 ? Math.floor(diff / 86_400_000) : 0;
}

function ageWeight(daysInWarehouse: number | null): number {
  if (daysInWarehouse === null) return CRITICAL_WEIGHTS.missingDate;
  if (daysInWarehouse >= 180) return CRITICAL_WEIGHTS.ageVeryHigh;
  if (daysInWarehouse >= 120) return CRITICAL_WEIGHTS.ageHigh;
  if (daysInWarehouse >= 90) return CRITICAL_WEIGHTS.ageMedium;
  if (daysInWarehouse >= 45) return CRITICAL_WEIGHTS.ageLow;
  return 0;
}

function ageLabel(t: ReturnType<typeof useLabels>, daysInWarehouse: number | null): string {
  if (daysInWarehouse === null) return t.criticalInventoryReasonMissingDate;
  if (daysInWarehouse >= 180) return t.criticalInventoryReasonAgeVeryHigh;
  if (daysInWarehouse >= 120) return t.criticalInventoryReasonAgeHigh;
  if (daysInWarehouse >= 90) return t.criticalInventoryReasonAgeMedium;
  return t.criticalInventoryReasonAgeLow;
}

function normalizeEanValue(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function hasMarketplaceEans(row: CriticalInventorySourceRow, keys: Array<keyof CriticalInventorySourceRow>): boolean {
  return keys.some((key) => normalizeEanValue(row[key]) !== "");
}

function firstText(...values: Array<unknown>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function buildEditRow(row: CriticalInventorySourceRow, photos: string[]): SofortListRow {
  const stockStatus = row.stock_status === "returned" || row.stock_status === "out" || row.stock_status === "in_stock"
    ? row.stock_status
    : row.stock_status === false
      ? "out"
      : "in_stock";

  return {
    id: String(row.id ?? `critical-${row.kid_id}-${row.kid_number}`),
    kidId: Number(row.kid_id),
    orderDbId: typeof row.order_db_id === "number" ? row.order_db_id : null,
    kidNumber: row.kid_number?.trim() || "-",
    ean: firstText(row.main_ean_jv, row.main_ean_xl, row.ean),
    siteEans: {
      jv: firstText(row.jv_ean, row.ean_jv, row.jv_site_ean, row.jvSiteEan),
      xl: firstText(row.xl_ean, row.ean_xl, row.xl_site_ean, row.xlSiteEan),
      ottoJv: firstText(row.otto_jv_ean, row.otto_ean_jv, row.ean_otto_jv, row.ottoJvEan),
      ottoXl: firstText(row.otto_xl_ean, row.otto_ean_xl, row.ean_otto_xl, row.ottoXlEan),
      ebayJv: firstText(row.ebay_jv_ean, row.ebay_ean_jv, row.ean_ebay_jv, row.ebayJvEan),
      ebayXl: firstText(row.ebay_xl_ean, row.ebay_ean_xl, row.ean_ebay_xl, row.ebayXlEan),
      kauflandJv: firstText(row.kaufland_jv_ean, row.kfl_jv_ean, row.ean_kaufland_jv, row.kauflandJvEan),
      kauflandXl: firstText(row.kaufland_xl_ean, row.kfl_xl_ean, row.ean_kaufland_xl, row.kauflandXlEan),
      hoodJv: firstText(row.hood_jv_ean, row.ean_hood_jv, row.hoodJvEan),
      hoodXl: firstText(row.hood_xl_ean, row.ean_hood_xl, row.hoodXlEan),
    },
    siteEanStatuses: {
      jv: null, xl: null, ottoJv: null, ottoXl: null, ebayJv: null, ebayXl: null, kauflandJv: null, kauflandXl: null, hoodJv: null, hoodXl: null,
    },
    photo: photos[0] ?? "-",
    photoUrls: photos,
    photoCount: photos.length,
    place: normalizePlaceValue(row.place),
    section: typeof row.section === "string" && row.section.trim() ? row.section.trim() : null,
    bWare: row.b_ware === true,
    stockStatus,
    inStock: stockStatus === "in_stock",
    store: row.store === true,
    quantity: typeof row.quantity === "number" && Number.isFinite(row.quantity) ? row.quantity : 0,
    room: typeof row.room === "string" && row.room.trim() ? row.room.trim() : null,
    furnitureType: typeof row.type === "string" && row.type.trim() ? row.type.trim() : null,
    company: typeof row.company === "string" && row.company.trim() ? row.company.trim() : null,
    commentary: typeof row.commentary === "string" && row.commentary.trim() ? row.commentary.trim() : null,
    color: typeof row.color === "string" && row.color.trim() ? row.color.trim() : null,
    size: typeof row.size === "string" && row.size.trim() ? row.size.trim() : null,
    material: typeof row.material === "string" && row.material.trim() ? row.material.trim() : null,
    price: firstText(row.price, row.global_price) || null,
    priceCurrency: null,
    marketplaceActive: null,
  };
}

function calculateCriticalScore(reasons: CriticalReason[]): number {
  if (reasons.length === 0 || CRITICAL_SCORE_MAX <= 0) return 0;
  const rawScore = reasons.reduce((sum, reason) => sum + reason.weight, 0);
  return Math.min(100, Math.max(1, Math.round((rawScore / CRITICAL_SCORE_MAX) * 100)));
}

function buildCriticalInventoryItem(row: CriticalInventorySourceRow, t: ReturnType<typeof useLabels>): CriticalInventoryItem | null {
  const reasons: CriticalReason[] = [];
  const place = normalizePlaceValue(row.place);
  const photos = normalizePhotoList(row.photo);
  const daysInWarehouse = parseDaysInWarehouse(row.order_date);
  const ageRisk = ageWeight(daysInWarehouse);

  if (ageRisk > 0) {
    reasons.push({ key: "age", label: ageLabel(t, daysInWarehouse), weight: ageRisk });
  }
  if (place === "-") reasons.push({ key: "place", label: t.criticalInventoryReasonMissingPlace, weight: CRITICAL_WEIGHTS.missingPlace });
  if (!hasText(row.section)) reasons.push({ key: "section", label: t.criticalInventoryReasonMissingSection, weight: CRITICAL_WEIGHTS.missingSection });
  if (photos.length === 0) reasons.push({ key: "photo", label: t.criticalInventoryReasonMissingPhoto, weight: CRITICAL_WEIGHTS.missingPhoto });
  if (!hasText(row.main_ean_jv ?? row.main_ean_xl ?? row.ean)) reasons.push({ key: "ean", label: t.criticalInventoryReasonMissingEan, weight: CRITICAL_WEIGHTS.missingMainEan });
  if (!hasMarketplaceEans(row, ["jv_ean", "ean_jv", "jv_site_ean", "jvSiteEan", "xl_ean", "ean_xl", "xl_site_ean", "xlSiteEan"])) reasons.push({ key: "sites-ean", label: t.criticalInventoryReasonMissingSitesEan, weight: CRITICAL_WEIGHTS.missingSitesEan });
  if (!hasMarketplaceEans(row, ["otto_jv_ean", "otto_ean_jv", "ean_otto_jv", "ottoJvEan", "otto_xl_ean", "otto_ean_xl", "ean_otto_xl", "ottoXlEan"])) reasons.push({ key: "otto-ean", label: t.criticalInventoryReasonMissingOttoEan, weight: CRITICAL_WEIGHTS.missingOttoEan });
  if (!hasMarketplaceEans(row, ["ebay_jv_ean", "ebay_ean_jv", "ean_ebay_jv", "ebayJvEan", "ebay_xl_ean", "ebay_ean_xl", "ean_ebay_xl", "ebayXlEan"])) reasons.push({ key: "ebay-ean", label: t.criticalInventoryReasonMissingEbayEan, weight: CRITICAL_WEIGHTS.missingEbayEan });
  if (!hasMarketplaceEans(row, ["kaufland_jv_ean", "kfl_jv_ean", "ean_kaufland_jv", "kauflandJvEan", "kaufland_xl_ean", "kfl_xl_ean", "ean_kaufland_xl", "kauflandXlEan"])) reasons.push({ key: "kaufland-ean", label: t.criticalInventoryReasonMissingKauflandEan, weight: CRITICAL_WEIGHTS.missingKauflandEan });
  if (!hasMarketplaceEans(row, ["hood_jv_ean", "ean_hood_jv", "hoodJvEan", "hood_xl_ean", "ean_hood_xl", "hoodXlEan"])) reasons.push({ key: "hood-ean", label: t.criticalInventoryReasonMissingHoodEan, weight: CRITICAL_WEIGHTS.missingHoodEan });
  if (!hasText(row.price ?? row.global_price)) reasons.push({ key: "price", label: t.criticalInventoryReasonMissingPrice, weight: CRITICAL_WEIGHTS.missingPrice });
  if (typeof row.quantity !== "number" || !Number.isFinite(row.quantity) || row.quantity <= 0) reasons.push({ key: "quantity", label: t.criticalInventoryReasonMissingQuantity, weight: CRITICAL_WEIGHTS.missingQuantity });
  if (!hasText(row.room)) reasons.push({ key: "room", label: t.criticalInventoryReasonMissingRoom, weight: CRITICAL_WEIGHTS.missingRoom });
  if (!hasText(row.type)) reasons.push({ key: "type", label: t.criticalInventoryReasonMissingType, weight: CRITICAL_WEIGHTS.missingType });
  if (!hasText(row.company)) reasons.push({ key: "company", label: t.criticalInventoryReasonMissingCompany, weight: CRITICAL_WEIGHTS.missingCompany });
  if (!hasText(row.color)) reasons.push({ key: "color", label: t.criticalInventoryReasonMissingColor, weight: CRITICAL_WEIGHTS.missingColor });
  if (!hasText(row.size)) reasons.push({ key: "size", label: t.criticalInventoryReasonMissingSize, weight: CRITICAL_WEIGHTS.missingSize });
  if (!hasText(row.material)) reasons.push({ key: "material", label: t.criticalInventoryReasonMissingMaterial, weight: CRITICAL_WEIGHTS.missingMaterial });
  if (!hasText(row.commentary)) reasons.push({ key: "commentary", label: t.criticalInventoryReasonMissingCommentary, weight: CRITICAL_WEIGHTS.missingCommentary });
  if (!hasText(row.kid_account)) reasons.push({ key: "account", label: t.criticalInventoryReasonMissingAccount, weight: CRITICAL_WEIGHTS.missingAccount });

  const score = calculateCriticalScore(reasons);
  if (score <= 0) return null;

  return {
    id: String(row.id ?? `critical-${row.kid_id}-${row.kid_number}`),
    kidNumber: row.kid_number?.trim() || "-",
    place,
    photoUrl: photos[0] ?? null,
    editRow: buildEditRow(row, photos),
    score,
    daysInWarehouse,
    reasons: reasons.sort((left, right) => right.weight - left.weight),
  };
}

function CriticalReasonLine({ itemId, reasons }: { itemId: string; reasons: CriticalReason[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(reasons.length);
  const moreLabel = `+${reasons.length}`;

  useEffect(() => {
    const updateVisibleCount = () => {
      const containerElement = containerRef.current;
      const measureElement = measureRef.current;
      if (!containerElement || !measureElement) return;

      const containerWidth = Math.max(0, containerElement.clientWidth - 12);
      if (containerWidth <= 0) {
        setVisibleCount(reasons.length);
        return;
      }

      const reasonNodes = Array.from(measureElement.querySelectorAll<HTMLElement>("[data-role='measure-reason']"));
      const moreNode = measureElement.querySelector<HTMLElement>("[data-role='measure-more']");
      const gap = 4;
      const reasonWidths = reasonNodes.map((node) => Math.ceil(node.offsetWidth));
      const moreWidth = Math.ceil(moreNode?.offsetWidth ?? 32);

      if (reasonWidths.length === 0) {
        setVisibleCount(0);
        return;
      }

      let usedWidth = 0;
      let nextVisibleCount = 0;

      for (let index = 0; index < reasonWidths.length; index += 1) {
        const nextWidth = nextVisibleCount === 0 ? reasonWidths[index] : usedWidth + gap + reasonWidths[index];
        const remainingCount = reasonWidths.length - index - 1;
        const reservedWidth = remainingCount > 0 ? gap + moreWidth : 0;

        if (nextWidth + reservedWidth <= containerWidth) {
          usedWidth = nextWidth;
          nextVisibleCount = index + 1;
          continue;
        }

        break;
      }

      setVisibleCount(nextVisibleCount > 0 ? nextVisibleCount : 1);
    };

    updateVisibleCount();
    const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateVisibleCount) : null;
    if (resizeObserver) {
      if (containerRef.current) {
        resizeObserver.observe(containerRef.current);
      }
      if (measureRef.current) {
        resizeObserver.observe(measureRef.current);
      }
    }
    window.addEventListener("resize", updateVisibleCount);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateVisibleCount);
    };
  }, [reasons]);

  const hiddenCount = Math.max(0, reasons.length - visibleCount);

  return (
    <>
      <div ref={containerRef} className="wh-critical-inventory__reasons">
        {reasons.slice(0, visibleCount).map((reason) => (
          <Badge key={`${itemId}-${reason.key}`} variant="outline" className="wh-critical-inventory__reason">
            {reason.label}
          </Badge>
        ))}
        {hiddenCount > 0 ? (
          <Badge variant="outline" className="wh-critical-inventory__reason wh-critical-inventory__reason--more">
            +{hiddenCount}
          </Badge>
        ) : null}
      </div>
      <div ref={measureRef} className="wh-critical-inventory__reasons-measure" aria-hidden="true">
        {reasons.map((reason) => (
          <Badge key={`measure-${itemId}-${reason.key}`} variant="outline" className="wh-critical-inventory__reason" data-role="measure-reason">
            {reason.label}
          </Badge>
        ))}
        <Badge variant="outline" className="wh-critical-inventory__reason wh-critical-inventory__reason--more" data-role="measure-more">
          {moreLabel}
        </Badge>
      </div>
    </>
  );
}

function CriticalInventorySkeletonCard({ index }: { index: number }) {
  return (
    <div className="wh-critical-inventory__item" aria-hidden="true">
      <div className="wh-critical-inventory__thumb-wrap">
        <Skeleton className="wh-critical-inventory__thumb rounded-[10px]" />
      </div>
      <div className="wh-critical-inventory__main">
        <div className="wh-critical-inventory__topline">
          <Skeleton className={`h-4 ${index % 2 === 0 ? "w-28" : "w-32"}`} />
          <Skeleton className="h-5 w-12" />
        </div>
        <div className="wh-critical-inventory__meta">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="wh-critical-inventory__footer">
          <div className="wh-critical-inventory__reasons">
            <Skeleton className="h-7 w-40 rounded-full" />
            <Skeleton className="h-7 w-[7.5rem] rounded-full" />
            <Skeleton className="h-7 w-[6.5rem] rounded-full" />
            <Skeleton className="h-7 w-[5.5rem] rounded-full" />
          </div>
          <Skeleton className="h-9 w-28 rounded-[var(--radius-control)]" />
        </div>
      </div>
    </div>
  );
}

export function CriticalInventoryPanel() {
  const t = useLabels();
  const lang = useLanguage();
  const cardRef = useRef<HTMLDivElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [items, setItems] = useState<CriticalInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(CRITICAL_PAGE_SIZE);
  const [maxHeight, setMaxHeight] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<SofortListRow | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [availablePlaces, setAvailablePlaces] = useState<string[]>([]);
  const [occupiedPlaces, setOccupiedPlaces] = useState<string[]>([]);
  const locale = lang === "ru" ? "ru-RU" : lang === "de" ? "de-DE" : "en-US";

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetchDatabaseServiceWithSessionRetry(`${getServicesApiBase()}/inventory/critical/`);
        if (!response.ok) throw new Error(`critical_inventory_request_failed:${response.status}`);
        const payload = await response.json() as CriticalInventoryResponse;
        const allRows = payload.results;
        const nextItems = allRows
          .map((row) => buildCriticalInventoryItem(row, t))
          .filter((item): item is CriticalInventoryItem => item !== null)
          .sort((left, right) => right.score - left.score || (right.daysInWarehouse ?? 0) - (left.daysInWarehouse ?? 0) || left.kidNumber.localeCompare(right.kidNumber));

        if (active) {
          setItems(nextItems);
          setAvailablePlaces(payload.available_places);
          setOccupiedPlaces(payload.occupied_places);
          setVisibleCount(CRITICAL_PAGE_SIZE);
        }
      } catch (loadError) {
        console.error("CRITICAL_INVENTORY_LOAD_ERROR", loadError);
        if (active) {
          setItems([]);
          setError(loadError instanceof Error ? loadError.message : t.serviceUnavailable);
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
  }, [reloadToken, t]);

  useEffect(() => {
    const updateHeight = () => {
      const element = cardRef.current;
      if (!element) return;
      const nextHeight = Math.max(360, Math.floor(window.innerHeight - element.getBoundingClientRect().top - 12));
      setMaxHeight((current) => current === nextHeight ? current : nextHeight);
    };

    updateHeight();
    const frameId = window.requestAnimationFrame(updateHeight);
    window.addEventListener("resize", updateHeight);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", updateHeight);
    };
  }, [items.length, loading, visibleCount]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleItems.length < items.length;

  useEffect(() => {
    if (!hasMore) return;

    const element = contentRef.current;
    if (!element) return;

    if (element.scrollHeight <= element.clientHeight + 8) {
      setVisibleCount((current) => Math.min(items.length, current + CRITICAL_PAGE_SIZE));
    }
  }, [hasMore, items.length, visibleItems.length]);

  const handleScroll = () => {
    const element = contentRef.current;
    if (!element || !hasMore) return;

    const remaining = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (remaining <= 80) {
      setVisibleCount((current) => {
        if (current >= items.length) return current;
        return Math.min(items.length, current + CRITICAL_PAGE_SIZE);
      });
    }
  };

  return (
    <Card ref={cardRef} className="wh-section-card wh-dashboard__critical-card" style={maxHeight ? { height: `${maxHeight}px` } : undefined}>
      <CardContent className="wh-section-card__body">
        {loading ? (
          <div className="wh-critical-inventory__skeleton">
            {Array.from({ length: 5 }).map((_, index) => <CriticalInventorySkeletonCard key={index} index={index} />)}
          </div>
        ) : error ? (
          <div className="wh-empty-state wh-empty-state--dashboard wh-dashboard-empty-state flex min-h-[160px] flex-col items-center justify-center gap-2 text-center">
            <p className="text-sm font-medium text-foreground">{t.criticalInventoryLoadFailed}</p>
            <p className="max-w-md text-xs text-muted-foreground">{error}</p>
          </div>
        ) : items.length === 0 ? (
          <div className="wh-empty-state wh-empty-state--dashboard wh-dashboard-empty-state flex min-h-[160px] flex-col items-center justify-center gap-3 text-center">
            <PackageSearch aria-hidden="true" className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">{t.criticalInventoryEmptyTitle}</p>
              <p className="max-w-md text-xs text-muted-foreground">{t.criticalInventoryEmptyDescription}</p>
            </div>
          </div>
        ) : (
          <>
            <div ref={contentRef} className="wh-critical-inventory__content" onScroll={handleScroll}>
              <ol className="wh-critical-inventory">
                {visibleItems.map((item) => (
                  <li key={item.id} className="wh-critical-inventory__item">
                    <div className="wh-critical-inventory__thumb-wrap">
                      {item.photoUrl ? (
                        // Critical inventory previews use runtime-configured media URLs and cannot be safely allowlisted at build time.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.photoUrl} alt={`KID ${item.kidNumber}`} loading="lazy" className="wh-critical-inventory__thumb" />
                      ) : (
                        <div className="wh-critical-inventory__thumb-placeholder" aria-hidden="true">
                          <PackageSearch />
                        </div>
                      )}
                    </div>
                    <div className="wh-critical-inventory__main">
                      <div className="wh-critical-inventory__topline">
                        <strong className="wh-critical-inventory__kid">KID {item.kidNumber}</strong>
                        <strong className="wh-critical-inventory__score">{new Intl.NumberFormat(locale).format(item.score)}%</strong>
                      </div>
                      <div className="wh-critical-inventory__meta">
                        <span>{t.place}: {item.place}</span>
                        <span className="wh-critical-inventory__days">
                          <Clock3 aria-hidden="true" />
                          {item.daysInWarehouse === null ? t.criticalInventoryNoDate : t.criticalInventoryDaysStored.replace("{count}", String(item.daysInWarehouse))}
                        </span>
                      </div>
                      <div className="wh-critical-inventory__footer">
                        <CriticalReasonLine itemId={item.id} reasons={item.reasons} />
                        <Button type="button" variant="outline" size="sm" className="wh-critical-inventory__edit" onClick={() => setEditingRow(item.editRow)}>
                          {t.edit}
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </>
        )}
      </CardContent>
      <CriticalInventoryEditDialog
        open={Boolean(editingRow)}
        row={editingRow}
        availablePlaces={availablePlaces}
        occupiedPlaces={occupiedPlaces}
        onOpenChange={(open) => { if (!open) setEditingRow(null); }}
        onSaved={() => {
          setEditingRow(null);
          setReloadToken((current) => current + 1);
        }}
      />
    </Card>
  );
}
