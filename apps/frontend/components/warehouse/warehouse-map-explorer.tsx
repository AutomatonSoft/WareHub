"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import Image from "next/image";
import { Boxes, ChartNoAxesCombined, ChevronLeft, ChevronRight, CircleOff, ImageOff, LoaderCircle, MapPinned } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { useLabels } from "../../app/use-labels";
import { resolvePhotoUrl } from "../../app/client-api-afterbuy";
import { normalizePhotoList, type KidDto } from "../inventory/inventory-table-utils";
import { fetchInventoryRows, getServicesApiBase, type InventoryRowsApiResponse } from "../inventory/inventory-api";

type WarehouseSection = {
  id: string;
  color: string;
  element: "rect" | "path";
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  path?: string;
};

const warehouseSections: WarehouseSection[] = [
  { id: "A", color: "#F08A95", element: "path", path: "M25 109 Q25 106 28 106 H158 V42 Q158 35 165 35 H240 Q247 35 247 42 V279 Q247 286 240 286 H32 Q25 286 25 279 Z" },
  { id: "B", color: "#A9AFE1", element: "rect", x: 247, y: 89, width: 56, height: 197 },
  { id: "C", color: "#70C7D1", element: "rect", x: 303, y: 89, width: 29, height: 197 },
  { id: "D", color: "#F3C66B", element: "rect", x: 332, y: 89, width: 78, height: 197 },
  { id: "E", color: "#7AC8A4", element: "rect", x: 247, y: 35, width: 163, height: 53 },
  { id: "F", color: "#CDE48A", element: "rect", x: 490, y: 35, width: 57, height: 298 },
  { id: "G", color: "#72C5D3", element: "rect", x: 548, y: 35, width: 149, height: 44 },
  { id: "H", color: "#F08A95", element: "rect", x: 548, y: 79, width: 149, height: 46 },
  { id: "I", color: "#BFA1D5", element: "rect", x: 548, y: 125, width: 149, height: 47 },
  { id: "J", color: "#F3C66B", element: "rect", x: 548, y: 172, width: 149, height: 49 },
  { id: "K", color: "#72C5D3", element: "rect", x: 548, y: 221, width: 232, height: 52 },
  { id: "M", color: "#F1B6CA", element: "rect", x: 548, y: 273, width: 232, height: 60 }
];

const deliveryBoxes = [
  { targetX: 125, targetY: 183 },
  { targetX: 275, targetY: 168 },
  { targetX: 317, targetY: 168 },
  { targetX: 370, targetY: 168 },
  { targetX: 330, targetY: 60 },
  { targetX: 518, targetY: 184 },
  { targetX: 620, targetY: 55 },
  { targetX: 620, targetY: 100 },
  { targetX: 620, targetY: 145 },
  { targetX: 620, targetY: 195 },
  { targetX: 664, targetY: 247 },
  { targetX: 664, targetY: 303 }
];

function inventoryCount(response: InventoryRowsApiResponse): number {
  if (Array.isArray(response)) {
    return response.length;
  }

  return response.count ?? response.results?.length ?? 0;
}

function inventoryItems(response: InventoryRowsApiResponse): KidDto[] {
  return Array.isArray(response) ? response : response.results ?? [];
}

export function WarehouseMapExplorer() {
  const t = useLabels();
  const prefersReducedMotion = useReducedMotion();
  const [activeSectionId, setActiveSectionId] = useState("A");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [failedSections, setFailedSections] = useState<Record<string, true>>({});
  const [loadingSections, setLoadingSections] = useState<Record<string, true>>({});
  const [productsBySection, setProductsBySection] = useState<Record<string, KidDto[]>>({});
  const [loadingProductSections, setLoadingProductSections] = useState<Record<string, true>>({});
  const [failedProductSections, setFailedProductSections] = useState<Record<string, true>>({});
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [brokenPhotoUrl, setBrokenPhotoUrl] = useState<string | null>(null);
  const activeSection = useMemo(
    () => warehouseSections.find((section) => section.id === activeSectionId) ?? warehouseSections[0],
    [activeSectionId]
  );
  const activeCount = counts[activeSection.id];
  const hasPendingCounts = Object.keys(loadingSections).length > 0;
  const hasFailedCounts = Object.keys(failedSections).length > 0;
  const availableSections = warehouseSections.filter((section) => counts[section.id] !== undefined);
  const totalProducts = availableSections.reduce((total, section) => total + (counts[section.id] ?? 0), 0);
  const populatedSections = availableSections.filter((section) => (counts[section.id] ?? 0) > 0);
  const emptySections = availableSections.filter((section) => counts[section.id] === 0);
  const fullestSection = populatedSections.reduce<WarehouseSection | null>((fullest, section) => {
    if (!fullest || (counts[section.id] ?? 0) > (counts[fullest.id] ?? 0)) {
      return section;
    }
    return fullest;
  }, null);
  const activeProducts = productsBySection[activeSection.id] ?? [];
  const safeGalleryIndex = activeProducts.length === 0 ? 0 : galleryIndex % activeProducts.length;
  const activeProduct = activeProducts[safeGalleryIndex];
  const activeProductPhoto = activeProduct ? normalizePhotoList(activeProduct.photo)[0] ?? null : null;
  const activeProductPhotoUrl = activeProductPhoto ? resolvePhotoUrl(getServicesApiBase(), activeProductPhoto) : null;

  useEffect(() => {
    let cancelled = false;
    setLoadingSections(Object.fromEntries(warehouseSections.map((section) => [section.id, true])));

    void Promise.allSettled(
      warehouseSections.map(async (section) => ({
        sectionId: section.id,
        count: inventoryCount(await fetchInventoryRows({
          page: 1,
          pageSize: 1,
          location: "warehouse",
          section: section.id
        }))
      }))
    ).then((results) => {
      if (cancelled) {
        return;
      }

      const nextCounts: Record<string, number> = {};
      const nextFailedSections: Record<string, true> = {};
      results.forEach((result, index) => {
        const section = warehouseSections[index];
        if (result.status === "fulfilled") {
          nextCounts[result.value.sectionId] = result.value.count;
        } else {
          nextFailedSections[section.id] = true;
        }
      });
      setCounts(nextCounts);
      setFailedSections(nextFailedSections);
      setLoadingSections({});
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setGalleryIndex(0);
    setBrokenPhotoUrl(null);

    if (productsBySection[activeSection.id] !== undefined) {
      return;
    }

    let cancelled = false;
    setLoadingProductSections((current) => ({ ...current, [activeSection.id]: true }));

    void fetchInventoryRows({
      page: 1,
      pageSize: 100,
      location: "warehouse",
      section: activeSection.id
    })
      .then((response) => {
        if (!cancelled) {
          setProductsBySection((current) => ({ ...current, [activeSection.id]: inventoryItems(response) }));
          setFailedProductSections((current) => {
            if (!current[activeSection.id]) {
              return current;
            }
            const next = { ...current };
            delete next[activeSection.id];
            return next;
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailedProductSections((current) => ({ ...current, [activeSection.id]: true }));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingProductSections((current) => {
            const next = { ...current };
            delete next[activeSection.id];
            return next;
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activeSection.id, productsBySection]);

  const activateSection = (sectionId: string) => {
    setActiveSectionId(sectionId);
  };

  return (
    <section className="grid w-full gap-3 xl:grid-cols-[minmax(0,1fr)_19rem] xl:items-start">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <svg
          viewBox="14 23 776 331"
          role="img"
          aria-label={t.warehouseInteractiveMap}
          className="h-auto w-full"
        >
          <defs>
            <filter id="warehouse-section-selected" x="-8%" y="-8%" width="116%" height="120%">
              <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#172033" floodOpacity="0.22" />
            </filter>
          </defs>
          <image href="/warehouse-map.svg" x="14" y="23" width="776" height="331" />
          {warehouseSections.map((section) => {
            const active = section.id === activeSection.id;
            const commonProps = {
              role: "button" as const,
              tabIndex: 0,
              "aria-label": t.warehouseSectionAria.replace("{section}", section.id),
              onClick: () => activateSection(section.id),
              onKeyDown: (event: KeyboardEvent<SVGGElement>) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activateSection(section.id);
                }
              },
              className: "cursor-pointer outline-none"
            };

            return (
              <g key={section.id} {...commonProps}>
                {section.element === "path" && section.path ? (
                  <path
                    d={section.path}
                    fill={active ? "rgba(255, 255, 255, 0.22)" : "transparent"}
                    filter={active ? "url(#warehouse-section-selected)" : undefined}
                    className="transition-[fill,filter] duration-200 ease-out"
                    style={{ mixBlendMode: active ? "soft-light" : "normal" }}
                  />
                ) : (
                  <rect
                    x={section.x}
                    y={section.y}
                    width={section.width}
                    height={section.height}
                    fill={active ? "rgba(255, 255, 255, 0.22)" : "transparent"}
                    filter={active ? "url(#warehouse-section-selected)" : undefined}
                    className="transition-[fill,filter] duration-200 ease-out"
                    style={{ mixBlendMode: active ? "soft-light" : "normal" }}
                  />
                )}
              </g>
            );
          })}
          <g aria-hidden="true" pointerEvents="none">
            <motion.g
              animate={prefersReducedMotion ? { y: 172 } : { y: [430, 172, 172, 430, 430] }}
              transition={prefersReducedMotion ? { duration: 0 } : { duration: 22, repeat: Infinity, ease: "easeInOut", times: [0, 0.14, 0.52, 0.7, 1] }}
            >
              <image href="/warehouse-truck.svg" x="430" y="-63" width="40" height="63" />
            </motion.g>
            {deliveryBoxes.map((box, index) => {
              const startX = 436 + (index % 3) * 12;
              const startY = 122 + Math.floor(index / 3) * 10;
              const unloadX = 430 + (index % 3) * 14;
              const unloadY = 41 + Math.floor(index / 3) * 14;
              const unloadStart = 0.18 + index * 0.015;
              const unloadEnd = unloadStart + 0.07;
              const flyStart = 0.56 + index * 0.006;
              const flyEnd = flyStart + 0.12;

              return (
                <motion.g
                  key={`delivery-box-${index}`}
                  animate={prefersReducedMotion ? { opacity: 0 } : {
                    opacity: [0, 0, 1, 1, 1, 0],
                    x: [0, 0, unloadX - startX, unloadX - startX, box.targetX - startX, box.targetX - startX],
                    y: [0, 0, unloadY - startY, unloadY - startY, box.targetY - startY, box.targetY - startY]
                  }}
                  transition={prefersReducedMotion ? { duration: 0 } : {
                    duration: 22,
                    repeat: Infinity,
                    ease: "easeInOut",
                    times: [0, unloadStart, unloadEnd, flyStart, flyEnd, 0.78]
                  }}
                >
                  <rect x={startX} y={startY} width="12" height="12" rx="2" fill="#F3C66B" stroke="#C99A35" strokeWidth="1.25" />
                  <path d={`M${startX + 6} ${startY + 2} V${startY + 10} M${startX + 2} ${startY + 6} H${startX + 10}`} stroke="#FFFFFF" strokeWidth="1" strokeLinecap="round" />
                </motion.g>
              );
            })}
          </g>
        </svg>

      </div>

      <div className="grid self-start gap-3 xl:sticky xl:top-0">
      <aside className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
        <div className="h-1" style={{ backgroundColor: activeSection.color }} />
        <div className="p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-2xl text-slate-800" style={{ backgroundColor: `${activeSection.color}66` }}>
            <Boxes size={21} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t.zoneDetails}</p>
            <h2 className="text-lg font-semibold text-foreground">{t.warehouse} {activeSection.id}</h2>
          </div>
        </div>

        <div className="mt-6 rounded-2xl border p-4" style={{ borderColor: `${activeSection.color}99`, backgroundColor: `${activeSection.color}1F` }}>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t.totalProducts}</p>
          <div className="mt-2 flex items-end gap-2">
            {loadingSections[activeSection.id] ? (
              <LoaderCircle className="size-8 animate-spin text-primary" aria-label={t.loading} />
            ) : (
              <p className="text-4xl font-semibold tracking-tight text-foreground">{failedSections[activeSection.id] ? "—" : activeCount ?? 0}</p>
            )}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-4 gap-2">
          {warehouseSections.map((section) => {
            const active = section.id === activeSection.id;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => activateSection(section.id)}
                style={active ? { borderColor: section.color, backgroundColor: section.color, color: "#172033" } : undefined}
                className={`flex h-10 items-center justify-center rounded-xl border text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? "shadow-sm" : "border-border/70 bg-muted/20 text-foreground hover:border-primary/40 hover:bg-primary/5"}`}
              >
                {section.id}
              </button>
            );
          })}
        </div>
        </div>
      </aside>

      <section className="overflow-hidden rounded-2xl border border-border/70 bg-card p-3 shadow-sm" aria-label={`${t.warehouseSectionProducts} ${activeSection.id}`}>
        <div className="relative aspect-[6/5] overflow-hidden rounded-xl bg-muted/50">
          {loadingProductSections[activeSection.id] ? (
            <div className="flex size-full items-center justify-center">
              <LoaderCircle className="size-6 animate-spin text-primary" aria-label={t.loading} />
            </div>
          ) : failedProductSections[activeSection.id] || activeProducts.length === 0 ? (
            <div className="flex size-full flex-col items-center justify-center gap-2 text-center text-sm font-medium text-muted-foreground">
              <ImageOff size={24} />
              <span>{t.warehouseSectionNoProducts}</span>
            </div>
          ) : (
            <>
              {activeProductPhotoUrl && brokenPhotoUrl !== activeProductPhotoUrl ? (
                <Image src={activeProductPhotoUrl} alt={activeProduct.title} fill unoptimized sizes="304px" className="object-contain p-2" onError={() => setBrokenPhotoUrl(activeProductPhotoUrl)} />
              ) : (
                <div className="flex size-full items-center justify-center">
                  <ImageOff className="size-8 text-muted-foreground" aria-label={t.productEditorNoImage} />
                </div>
              )}
              {activeProducts.length > 1 ? (
                <>
                  <button
                    type="button"
                    onClick={() => setGalleryIndex((current) => (current + activeProducts.length - 1) % activeProducts.length)}
                    className="absolute left-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-sm transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label={t.previous}
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setGalleryIndex((current) => (current + 1) % activeProducts.length)}
                    className="absolute right-2 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-full border border-border/70 bg-background/90 text-foreground shadow-sm transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                    aria-label={t.next}
                  >
                    <ChevronRight size={18} />
                  </button>
                  <span className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-foreground/80 px-2 py-1 text-xs font-semibold text-background">{safeGalleryIndex + 1} / {activeProducts.length}</span>
                </>
              ) : null}
            </>
          )}
        </div>
      </section>
      </div>

      <section className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm xl:col-span-2" aria-label={t.warehouseInventoryOverview}>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">{t.warehouseInventoryOverview}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t.warehouseInventoryOverviewDescription}</p>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <WarehouseInventoryMetric icon={Boxes} label={t.totalProducts} value={hasPendingCounts ? null : hasFailedCounts ? "—" : totalProducts} tone="bg-sky-500/10 text-sky-700" />
          <WarehouseInventoryMetric icon={MapPinned} label={t.warehousePopulatedSections} value={hasPendingCounts ? null : hasFailedCounts ? "—" : `${populatedSections.length}/${warehouseSections.length}`} tone="bg-emerald-500/10 text-emerald-700" />
          <WarehouseInventoryMetric icon={ChartNoAxesCombined} label={t.warehouseFullestSection} value={hasPendingCounts ? null : hasFailedCounts || !fullestSection ? "—" : `${fullestSection.id} · ${counts[fullestSection.id]}`} tone="bg-amber-500/10 text-amber-700" />
          <WarehouseInventoryMetric icon={CircleOff} label={t.warehouseEmptySections} value={hasPendingCounts ? null : hasFailedCounts ? "—" : emptySections.length} tone="bg-rose-500/10 text-rose-700" />
        </div>

        <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-6 xl:grid-cols-12" aria-label={t.warehouseProductsBySection}>
          {warehouseSections.map((section) => {
            const active = section.id === activeSection.id;
            const value = loadingSections[section.id] ? null : failedSections[section.id] ? "—" : counts[section.id] ?? 0;
            return (
              <button
                key={section.id}
                type="button"
                onClick={() => activateSection(section.id)}
                aria-label={`${t.warehouseProductsBySection}: ${section.id}`}
                className={`flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${active ? "border-transparent shadow-sm" : "border-border/60 bg-muted/20 hover:border-primary/40 hover:bg-primary/5"}`}
                style={active ? { backgroundColor: `${section.color}70`, color: "#172033" } : undefined}
              >
                <span className="text-xs font-semibold">{section.id}</span>
                {value === null ? <LoaderCircle className="mt-1 size-4 animate-spin text-primary" aria-label={t.loading} /> : <span className="mt-1 text-base font-semibold leading-none">{value}</span>}
              </button>
            );
          })}
        </div>
      </section>
    </section>
  );
}

function WarehouseInventoryMetric({
  icon: Icon,
  label,
  value,
  tone
}: {
  icon: typeof Boxes;
  label: string;
  value: string | number | null;
  tone: string;
}) {
  return (
    <div className="flex min-h-20 items-center gap-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-3">
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${tone}`}>
        <Icon size={19} strokeWidth={2.1} />
      </span>
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
        {value === null ? <LoaderCircle className="mt-1 size-5 animate-spin text-primary" aria-label={label} /> : <p className="mt-1 truncate text-xl font-semibold tracking-tight text-foreground">{value}</p>}
      </div>
    </div>
  );
}
