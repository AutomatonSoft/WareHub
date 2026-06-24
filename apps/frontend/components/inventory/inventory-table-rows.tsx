"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { Badge } from "../shared/badge";
import { Checkbox } from "../ui/checkbox";
import { Skeleton } from "../shared/skeleton";
import { TableEmptyRow } from "../shared/table/table-empty-row";
import {
  compactText,
  formatPriceWithoutDots,
  statusTone,
  type InventoryRow,
} from "./inventory-table-utils";

type InventoryTableRowsProps = {
  loading: boolean;
  rows: InventoryRow[];
  filteredCount: number;
  deletingRowId: string | null;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  selectedRowIds: Set<string>;
  onToggleRowSelection: (rowId: string) => void;
  onDeleteRow: (row: InventoryRow) => Promise<void>;
};

const COLUMN_COUNT = 9;

export function InventoryTableRows({
  loading,
  rows,
  filteredCount,
  deletingRowId,
  emptyActionLabel,
  onEmptyAction,
  selectedRowIds,
  onToggleRowSelection,
  onDeleteRow,
}: InventoryTableRowsProps) {
  const t = useLabels();
  const skeletonRowCount = 8;
  const [fullscreenViewer, setFullscreenViewer] = useState<{ rowId: string; photos: string[]; index: number } | null>(null);
  const [rowPhotoIndexes, setRowPhotoIndexes] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!fullscreenViewer) return;

    window.history.pushState({ inventoryPhotoViewer: true }, "");

    const handlePopState = () => {
      setFullscreenViewer(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [fullscreenViewer]);

  function closeFullscreenPhoto() {
    setFullscreenViewer(null);
  }

  function getRowPhotos(row: InventoryRow): string[] {
    return row.photos.length > 0 ? row.photos : row.photo !== "-" ? [row.photo] : [];
  }

  function getRowPhotoIndex(row: InventoryRow): number {
    const photos = getRowPhotos(row);
    if (photos.length === 0) return 0;
    const rawIndex = rowPhotoIndexes[row.id] ?? 0;
    if (rawIndex < 0) return 0;
    if (rawIndex >= photos.length) return photos.length - 1;
    return rawIndex;
  }

  function updateRowPhotoIndex(row: InventoryRow, direction: -1 | 1) {
    const photos = getRowPhotos(row);
    if (photos.length <= 1) return;
    setRowPhotoIndexes((current) => {
      const currentIndex = typeof current[row.id] === "number" ? current[row.id] : 0;
      const nextIndex = (currentIndex + direction + photos.length) % photos.length;
      return { ...current, [row.id]: nextIndex };
    });
  }

  function openFullscreenPhoto(row: InventoryRow) {
    const photos = getRowPhotos(row);
    if (photos.length === 0) return;
    setFullscreenViewer({
      rowId: row.id,
      photos,
      index: getRowPhotoIndex(row),
    });
  }

  function shiftFullscreenPhoto(direction: -1 | 1) {
    setFullscreenViewer((current) => {
      if (!current || current.photos.length <= 1) return current;
      const nextIndex = (current.index + direction + current.photos.length) % current.photos.length;
      return { ...current, index: nextIndex };
    });
  }

  if (loading) {
    return (
      <>
        {Array.from({ length: skeletonRowCount }).map((_, index) => (
          <tr key={`inventory-skeleton-${index}`} className="ui-skeleton-shell ui-skeleton-row">
            <td className="align-middle px-2 py-4 text-center"><Skeleton className="mx-auto h-4 w-4 rounded" delayMs={index * 80} /></td>
            <td className="align-middle px-3 py-4 text-center"><Skeleton className="mx-auto h-20 w-20 rounded-xl" delayMs={index * 80 + 20} /></td>
            <td className="align-middle px-3 py-4"><div className="space-y-2"><Skeleton className="h-4 w-28" delayMs={index * 80 + 40} /><Skeleton className="h-4 w-40" delayMs={index * 80 + 60} /><Skeleton className="h-4 w-48" delayMs={index * 80 + 80} /></div></td>
            <td className="align-middle px-3 py-4"><div className="space-y-2"><Skeleton className="h-4 w-24" delayMs={index * 80 + 80} /><Skeleton className="h-4 w-36" delayMs={index * 80 + 100} /><Skeleton className="h-4 w-28" delayMs={index * 80 + 120} /></div></td>
            <td className="align-middle px-3 py-4"><div className="space-y-2"><Skeleton className="h-4 w-full" delayMs={index * 80 + 140} /><Skeleton className="h-4 w-5/6" delayMs={index * 80 + 160} /><Skeleton className="h-4 w-full" delayMs={index * 80 + 180} /><Skeleton className="h-4 w-2/3" delayMs={index * 80 + 200} /></div></td>
            <td className="align-middle px-3 py-4"><Skeleton className="h-4 w-24" delayMs={index * 80 + 210} /></td>
            <td className="align-middle px-3 py-4"><Skeleton className="h-6 w-20 rounded-full" delayMs={index * 80 + 220} /></td>
            <td className="align-middle px-3 py-4"><Skeleton className="h-4 w-20" delayMs={index * 80 + 230} /></td>
            <td className="align-middle px-3 py-4 text-center"><Skeleton className="mx-auto h-8 w-8 rounded-full" delayMs={index * 80 + 240} /></td>
          </tr>
        ))}
      </>
    );
  }

  return (
    <>
      {rows.map((row, index) => {
        const rowPhotos = getRowPhotos(row);
        const rowPhotoIndex = getRowPhotoIndex(row);
        const currentPhoto = rowPhotos[rowPhotoIndex] ?? "-";
        return (
          <tr key={row.id} className={`ui-table-row wh-inventory-table-row ${index % 2 === 0 ? "ui-table-row-even" : "ui-table-row-odd"}`}>
            <td className="align-middle px-2 py-3 text-center">
              <Checkbox
                checked={selectedRowIds.has(row.id)}
                onCheckedChange={() => onToggleRowSelection(row.id)}
                aria-label={`Select row ${row.kidNumber} ${row.orderId}`}
              />
            </td>
            <td className="wh-inventory-photo-cell align-middle px-3 py-3 text-center">
              {currentPhoto !== "-" ? (
                <div className="wh-inventory-photo-stack">
                  <div className="wh-inventory-photo-frame">
                    {rowPhotos.length > 1 ? (
                      <button
                        type="button"
                        className="wh-inventory-gallery-button wh-inventory-gallery-button--left"
                        aria-label="Previous photo"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateRowPhotoIndex(row, -1);
                        }}
                      >
                        <ChevronLeft size={12} />
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="wh-sofort-product-cell__image relative"
                      onClick={() => openFullscreenPhoto(row)}
                      aria-label={`${t.preview} ${row.kidNumber}`}
                      title={`${t.preview} ${row.kidNumber}`}
                    >
                      <Image
                        src={currentPhoto}
                        alt={`${t.kid} ${row.kidNumber}`}
                        width={120}
                        height={120}
                        unoptimized
                        className="ui-hover-preview-thumb wh-inventory-thumb wh-sofort-photo"
                      />
                      <span className="ui-hover-preview-panel">
                        <Image
                          src={currentPhoto}
                          alt={`${t.preview} ${row.kidNumber}`}
                          width={180}
                          height={180}
                          unoptimized
                          className="ui-hover-preview-popover h-[180px] w-[180px]"
                        />
                      </span>
                      <span className="wh-inventory-photo-counter">{rowPhotoIndex + 1}/{rowPhotos.length}</span>
                    </button>
                    {rowPhotos.length > 1 ? (
                      <button
                        type="button"
                        className="wh-inventory-gallery-button wh-inventory-gallery-button--right"
                        aria-label="Next photo"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateRowPhotoIndex(row, 1);
                        }}
                      >
                        <ChevronRight size={12} />
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="wh-inventory-photo-stack">
                  <div className="wh-sofort-product-cell__image">
                    <div className="wh-sofort-photo-placeholder wh-inventory-thumb" />
                  </div>
                </div>
              )}
            </td>
            <td className="wh-inventory-product-cell align-middle px-3 py-3">
              <div className="wh-sofort-product-cell__content wh-inventory-product-cell__content">
                <p className="wh-sofort-product-cell__title wh-inventory-kid-line">
                  <span className="wh-sofort-product-cell__title-label">{t.kid}</span>
                  <Link href={`/inventory/kid/${row.kidId}`} className="wh-sofort-product-cell__title-value wh-inventory-kid-link text-[color:var(--primary)] underline-offset-2 hover:underline">
                    {row.kidNumber}
                  </Link>
                </p>
                <p className="wh-sofort-product-cell__meta wh-inventory-order-line" title={row.orderId}>
                  {t.orderId}: {compactText(row.orderId, 28)}
                </p>
                <p className="wh-inventory-inline-title" title={row.title}>{row.title}</p>
              </div>
            </td>
            <td className="align-middle px-3 py-3">
              <div className="wh-inventory-meta-cell">
                <p className="wh-inventory-meta-line" title={row.platform}>
                  <span>Platform</span>
                  <span>{compactText(row.platform, 18)}</span>
                </p>
                <p className="wh-inventory-meta-line" title={row.buyer}>
                  <span>{t.buyer}</span>
                  <span>{compactText(row.buyer, 20)}</span>
                </p>
                <p className="wh-inventory-meta-line" title={row.sku}>
                  <span>{t.sku}</span>
                  <span>{compactText(row.sku, 22)}</span>
                </p>
                {row.additionalOrderIds !== "-" ? (
                  <p className="wh-inventory-meta-line" title={row.additionalOrderIds}>
                    <span>Child</span>
                    <span>{compactText(row.additionalOrderIds, 20)}</span>
                  </p>
                ) : null}
              </div>
            </td>
            <td className="align-middle px-3 py-3">
              {row.memo !== "-" ? (
                <div className="wh-inventory-memo-panel" title={row.memo}>
                  <pre className="wh-inventory-memo-scroll">{row.memo}</pre>
                </div>
              ) : (
                <span className="ui-table-data-secondary">-</span>
              )}
            </td>
            <td className="ui-listing-cell ui-table-data-secondary wh-inventory-price-cell px-3 py-3 font-medium">
              <span className="ui-listing-cell-text wh-inventory-price-text">{compactText(formatPriceWithoutDots(row.paymentStatus), 20)}</span>
            </td>
            <td className="align-middle wh-inventory-status-cell px-3 py-3">
              <Badge tone={statusTone(row.status)}>{row.status}</Badge>
            </td>
            <td className="ui-table-data-secondary align-middle px-3 py-3">
              <span className="wh-inventory-date-text">{row.date}</span>
            </td>
            <td className="align-middle wh-inventory-actions-cell wh-inventory-actions-sticky px-3 py-3 text-center">
              <button
                type="button"
                aria-label={`${t.delete} ${row.orderId}`}
                disabled={deletingRowId === row.id}
                onClick={() => void onDeleteRow(row)}
                className="wh-icon-action wh-icon-action-danger focus-ring inline-flex h-8 w-8 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </td>
          </tr>
        );
      })}
      {filteredCount === 0 ? (
        <TableEmptyRow
          colSpan={COLUMN_COUNT}
          variant="inventory"
          title="No orders found"
          message="No order rows match the current query."
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
        />
      ) : null}
      {fullscreenViewer ? (
        <tr>
          <td colSpan={COLUMN_COUNT} className="p-0">
            <div className="wh-sofort-photo-viewer" role="dialog" aria-modal="true" onClick={closeFullscreenPhoto}>
              <button type="button" className="wh-sofort-photo-viewer__close" onClick={closeFullscreenPhoto} aria-label="Close image viewer">
                Close
              </button>
              <div className="relative wh-sofort-photo-viewer__content" onClick={(event) => event.stopPropagation()}>
                {fullscreenViewer.photos.length > 1 ? (
                  <button
                    type="button"
                    className="absolute left-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[color:rgba(15,23,42,0.56)] text-white shadow-lg backdrop-blur-sm transition hover:bg-[color:rgba(15,23,42,0.74)]"
                    aria-label="Previous photo"
                    onClick={() => shiftFullscreenPhoto(-1)}
                  >
                    <ChevronLeft size={18} />
                  </button>
                ) : null}
                <div className="absolute top-5 rounded-full border border-white/20 bg-[color:rgba(15,23,42,0.56)] px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-sm">
                  {fullscreenViewer.index + 1} / {fullscreenViewer.photos.length}
                </div>
                <Image src={fullscreenViewer.photos[fullscreenViewer.index]} alt="Inventory image" width={1600} height={1200} unoptimized className="wh-sofort-photo-viewer__image" />
                {fullscreenViewer.photos.length > 1 ? (
                  <button
                    type="button"
                    className="absolute right-4 top-1/2 z-10 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/20 bg-[color:rgba(15,23,42,0.56)] text-white shadow-lg backdrop-blur-sm transition hover:bg-[color:rgba(15,23,42,0.74)]"
                    aria-label="Next photo"
                    onClick={() => shiftFullscreenPhoto(1)}
                  >
                    <ChevronRight size={18} />
                  </button>
                ) : null}
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}
