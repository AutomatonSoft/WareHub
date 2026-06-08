"use client";

import { Fragment, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ChevronDown, ChevronRight, X } from "lucide-react";
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
  type VisibleColumns
} from "./inventory-table-utils";

type InventoryTableRowsProps = {
  loading: boolean;
  rows: InventoryRow[];
  filteredCount: number;
  visibleColumns: VisibleColumns;
  expandedRowId: string | null;
  deletingRowId: string | null;
  visibleColumnCount: number;
  rowIndexOffset: number;
  topSpacerHeight: number;
  bottomSpacerHeight: number;
  emptyActionLabel?: string;
  onEmptyAction?: () => void;
  selectedRowIds: Set<string>;
  onToggleRowSelection: (rowId: string) => void;
  onToggleRow: (rowId: string) => void;
  onDeleteRow: (row: InventoryRow) => Promise<void>;
};

export function InventoryTableRows({
  loading,
  rows,
  filteredCount,
  visibleColumns,
  expandedRowId,
  deletingRowId,
  visibleColumnCount,
  rowIndexOffset,
  topSpacerHeight,
  bottomSpacerHeight,
  emptyActionLabel,
  onEmptyAction,
  selectedRowIds,
  onToggleRowSelection,
  onToggleRow,
  onDeleteRow
}: InventoryTableRowsProps) {
  const t = useLabels();
  const skeletonRowCount = 8;
  const [fullscreenPhoto, setFullscreenPhoto] = useState<string | null>(null);

  useEffect(() => {
    if (!fullscreenPhoto) return;

    window.history.pushState({ inventoryPhotoViewer: true }, "");

    const handlePopState = () => {
      setFullscreenPhoto(null);
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, [fullscreenPhoto]);

  function closeFullscreenPhoto() {
    if (!fullscreenPhoto) return;
    setFullscreenPhoto(null);
  }

  if (loading) {
    return (
      <>
        {Array.from({ length: skeletonRowCount }).map((_, index) => (
          <tr
            key={`inventory-skeleton-${index}`}
            className="ui-skeleton-shell ui-skeleton-row"
          >
            <td className="ui-listing-sticky-col align-middle px-2 py-4 text-center" style={{ left: 0 }}>
              <Skeleton className="mx-auto h-4 w-4 rounded" delayMs={index * 80} />
            </td>
            <td className="ui-listing-sticky-col align-middle px-3 py-4" style={{ left: 44 }}><Skeleton className="h-5 w-14" delayMs={index * 80} /></td>
            <td className="ui-listing-sticky-col align-middle px-3 py-4" style={{ left: 134 }}>
              <Skeleton className="h-[120px] w-[120px] rounded-xl" delayMs={index * 80 + 20} />
            </td>
            <td className="ui-listing-sticky-col align-middle px-3 py-4" style={{ left: 304 }}>
              <div className="space-y-2">
                <Skeleton className="h-4 w-32" delayMs={index * 80 + 40} />
                <Skeleton className="h-4 w-40" delayMs={index * 80 + 60} />
              </div>
            </td>
            <td className={`${visibleColumns.place ? "table-cell" : "hidden"} align-middle px-3 py-4`}>
              <Skeleton className="h-4 w-12" delayMs={index * 80 + 80} />
            </td>
            <td className={`${visibleColumns.platform ? "table-cell" : "hidden"} align-middle px-3 py-4`}>
              <Skeleton className="h-4 w-16" delayMs={index * 80 + 90} />
            </td>
            <td className={`${visibleColumns.quantity ? "table-cell" : "hidden"} align-middle px-3 py-4`}>
              <Skeleton className="h-4 w-8" delayMs={index * 80 + 100} />
            </td>
            <td className="align-middle px-3 py-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" delayMs={index * 80 + 110} />
                <Skeleton className="h-4 w-5/6" delayMs={index * 80 + 130} />
                <Skeleton className="h-4 w-2/3" delayMs={index * 80 + 150} />
              </div>
            </td>
            <td className="align-middle px-3 py-4"><Skeleton className="h-4 w-20" delayMs={index * 80 + 160} /></td>
            <td className="align-middle px-3 py-4"><Skeleton className="h-6 w-20 rounded-full" delayMs={index * 80 + 170} /></td>
            <td className={`${visibleColumns.date ? "table-cell" : "hidden"} align-middle px-3 py-4`}>
              <Skeleton className="h-4 w-20" delayMs={index * 80 + 180} />
            </td>
            <td className="align-middle px-3 py-4 text-center"><Skeleton className="mx-auto h-8 w-8 rounded-full" delayMs={index * 80 + 190} /></td>
          </tr>
        ))}
      </>
    );
  }

  return (
    <>
      {topSpacerHeight > 0 ? (
        <tr aria-hidden="true">
          <td colSpan={visibleColumnCount} style={{ height: `${topSpacerHeight}px`, padding: 0 }} />
        </tr>
      ) : null}
      {rows.map((row, index) => {
        const absoluteIndex = rowIndexOffset + index;
        const rowClassName =
          absoluteIndex % 2 === 0
            ? "ui-table-row ui-table-row-even transition hover:bg-[color:rgba(16,185,129,0.06)]"
            : "ui-table-row ui-table-row-odd transition hover:bg-[color:rgba(16,185,129,0.06)]";
        return (
        <Fragment key={row.id}>
          <tr className={rowClassName}>
            <td className="ui-listing-sticky-col align-middle px-2 py-3 text-center" style={{ left: 0 }}>
              <Checkbox
                checked={selectedRowIds.has(row.id)}
                onCheckedChange={() => onToggleRowSelection(row.id)}
                aria-label={`Select row ${row.kidNumber}`}
              />
            </td>
            <td className="ui-listing-sticky-col wh-inventory-id-cell align-middle px-3 py-3 text-[color:var(--text-secondary)]" style={{ left: 44 }}>
              <button
                type="button"
                onClick={() => onToggleRow(row.id)}
                className="focus-ring wh-inventory-id-trigger inline-flex items-center gap-1 rounded-xl px-2 py-1 text-sm font-medium hover:bg-[color:rgba(16,185,129,0.12)]"
                aria-label={`${t.toggleDetailsFor} ${row.kidNumber}`}
              >
                {expandedRowId === row.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {row.kidId}
              </button>
            </td>
            <td className="ui-listing-sticky-col wh-inventory-photo-cell align-middle px-3 py-3 text-[color:var(--text-secondary)]" style={{ left: 134 }}>
              {row.photo !== "-" ? (
                <button
                  type="button"
                  className="group ui-hover-preview-trigger inline-flex items-center justify-center gap-2 border-0 bg-transparent p-0"
                  onClick={() => setFullscreenPhoto(row.photo)}
                >
                  <span className="relative inline-block">
                    <Image
                      src={row.photo}
                      alt={`${t.kid} ${row.kidNumber}`}
                      width={120}
                      height={120}
                      unoptimized
                      className="ui-hover-preview-thumb wh-inventory-thumb"
                    />
                    <span className="ui-hover-preview-panel">
                      <Image
                        src={row.photo}
                        alt={`${t.preview} ${row.kidNumber}`}
                        width={180}
                        height={180}
                        unoptimized
                        className="ui-hover-preview-popover h-[180px] w-[180px]"
                      />
                    </span>
                  </span>
                </button>
              ) : (
                <div className="flex items-center justify-center gap-2">
                  <div className="wh-inventory-thumb rounded-xl border border-dashed border-border bg-[color:rgba(16,185,129,0.06)]" />
                </div>
              )}
            </td>
            <td className="ui-listing-sticky-col wh-inventory-product-cell align-middle px-3 py-3" style={{ left: 304 }}>
              <div className="wh-inventory-product-cell__content">
                <p className="ui-table-data-secondary">
                  {t.kid}:{" "}
                  <Link
                    href={`/inventory/kid/${row.kidId}`}
                    className="ui-table-data-primary wh-inventory-kid-link font-semibold text-[color:var(--primary)] underline-offset-2 hover:underline"
                  >
                    {row.kidNumber}
                  </Link>
                </p>
                <p className="ui-table-data-primary wh-inventory-order-id font-semibold" title={row.parentOrderId}>
                  {t.order}: {compactText(row.parentOrderId, 32)}
                </p>
                {!visibleColumns.place || !visibleColumns.platform || !visibleColumns.quantity || !visibleColumns.date ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {!visibleColumns.place ? (
                      <span className="rounded-full border border-border bg-[color:rgba(16,185,129,0.08)] px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]">
                        {t.place}: {compactText(row.place, 12)}
                      </span>
                    ) : null}
                    {!visibleColumns.platform ? (
                      <span className="rounded-full border border-border bg-[color:rgba(16,185,129,0.08)] px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]">
                        {t.platform}: {compactText(row.platform, 10)}
                      </span>
                    ) : null}
                    {!visibleColumns.quantity ? (
                      <span className="rounded-full border border-border bg-[color:rgba(16,185,129,0.08)] px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]">
                        {t.qty}: {row.quantity}
                      </span>
                    ) : null}
                    {!visibleColumns.date ? (
                      <span className="rounded-full border border-border bg-[color:rgba(16,185,129,0.08)] px-2 py-0.5 text-[11px] text-[color:var(--text-muted)]">
                        {t.date}: {row.date}
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </td>
            <td className={`${visibleColumns.place ? "table-cell" : "hidden"} ui-listing-cell ui-table-data-secondary px-3 py-3`}>
              <span className="ui-listing-cell-text">{compactText(row.place, 26)}</span>
            </td>
            <td className={`${visibleColumns.platform ? "table-cell" : "hidden"} ui-listing-cell ui-table-data-secondary px-3 py-3`}>
              <span className="ui-listing-cell-text">{compactText(row.platform, 22)}</span>
            </td>
            <td className={`${visibleColumns.quantity ? "table-cell" : "hidden"} ui-table-data-secondary align-middle px-3 py-3 font-medium`}>
              {row.quantity}
            </td>
            <td className="align-middle px-3 py-3">
              <p
                title={row.title}
                className={`ui-table-data-secondary wh-inventory-title-text break-words ${visibleColumns.platform || visibleColumns.quantity ? "max-w-[280px]" : "max-w-[320px]"}`}
              >
                {row.title}
              </p>
            </td>
            <td className="ui-listing-cell ui-table-data-secondary wh-inventory-price-cell px-3 py-3 font-medium">
              <span className="ui-listing-cell-text wh-inventory-price-text">{compactText(formatPriceWithoutDots(row.globalPrice), 18)}</span>
            </td>
            <td className="align-middle wh-inventory-status-cell px-3 py-3">
              <Badge tone={statusTone(row.status)}>{row.status}</Badge>
            </td>
            <td className={`${visibleColumns.date ? "table-cell" : "hidden"} ui-listing-cell ui-table-data-secondary px-3 py-3`}>
              <span className="ui-listing-cell-text wh-inventory-date-text">{row.date}</span>
            </td>
            <td className="align-middle wh-inventory-actions-cell wh-inventory-actions-sticky px-3 py-3 text-center">
              <button
                type="button"
                aria-label={`${t.delete} ${row.entity === "order" ? row.parentOrderId : row.kidNumber}`}
                disabled={deletingRowId === row.id}
                onClick={() => void onDeleteRow(row)}
                className="wh-icon-action wh-icon-action-danger focus-ring inline-flex h-8 w-8 items-center justify-center rounded-xl border transition disabled:cursor-not-allowed disabled:opacity-50"
              >
                <X size={14} />
              </button>
            </td>
          </tr>
          {expandedRowId === row.id ? (
            <tr className="bg-[color:rgba(16,185,129,0.06)]">
              <td colSpan={visibleColumnCount} className="px-5 py-4">
                <div className="grid gap-3 text-xs leading-5 text-[color:var(--text-secondary)] md:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <p className="mb-1 uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.kidAccount}</p>
                    <p className="break-all">{row.kidAccount}</p>
                  </div>
                  <div>
                    <p className="mb-1 uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.additionalOrderIds}</p>
                    <p className="break-all">{row.additionalOrderIds}</p>
                  </div>
                  <div>
                    <p className="mb-1 uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.sku}</p>
                    <p className="break-all">{row.sku}</p>
                  </div>
                  <div>
                    <p className="mb-1 uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.globalPrice}</p>
                    <p>{formatPriceWithoutDots(row.globalPrice)}</p>
                  </div>
                  <div className="md:col-span-2 xl:col-span-2">
                    <p className="mb-1 uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.memo}</p>
                    <p className="break-words">{row.memo}</p>
                  </div>
                  <div className="md:col-span-2 xl:col-span-3">
                    <p className="mb-1 uppercase tracking-[0.08em] text-[color:var(--text-muted)]">{t.primaryPhotoUrl}</p>
                    <p className="break-all">{row.photo}</p>
                  </div>
                </div>
              </td>
            </tr>
          ) : null}
        </Fragment>
      )})}
      {bottomSpacerHeight > 0 ? (
        <tr aria-hidden="true">
          <td colSpan={visibleColumnCount} style={{ height: `${bottomSpacerHeight}px`, padding: 0 }} />
        </tr>
      ) : null}
      {filteredCount === 0 ? (
        <TableEmptyRow
          colSpan={visibleColumnCount}
          variant="inventory"
          title="No inventory rows found"
          message="No rows match the current query."
          actionLabel={emptyActionLabel}
          onAction={onEmptyAction}
        />
      ) : null}
      {fullscreenPhoto ? (
        <tr>
          <td colSpan={visibleColumnCount} className="p-0">
            <div className="wh-sofort-photo-viewer" role="dialog" aria-modal="true" onClick={closeFullscreenPhoto}>
              <button type="button" className="wh-sofort-photo-viewer__close" onClick={closeFullscreenPhoto} aria-label="Close image viewer">
                Close
              </button>
              <div className="wh-sofort-photo-viewer__content" onClick={(event) => event.stopPropagation()}>
                <Image src={fullscreenPhoto} alt="Inventory image" width={1600} height={1200} unoptimized className="wh-sofort-photo-viewer__image" />
              </div>
            </div>
          </td>
        </tr>
      ) : null}
    </>
  );
}



