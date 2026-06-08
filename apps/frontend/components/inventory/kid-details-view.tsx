"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLabels } from "../../app/use-labels";
import { Button } from "../shared/button";
import { Card, CardContent } from "../ui/card";
import { EmptyState } from "../ui/empty-state";
import { ErrorState } from "../ui/error-state";
import { KidDetailsMainCard } from "./kid-details/kid-details-main-card";
import { KidDetailsOrdersCard } from "./kid-details/kid-details-orders-card";
import { useKidDetailsMediaActions } from "./kid-details/use-kid-details-media-actions";
import {
  type InventoryApiRow,
  type InventoryRowsApiResponse,
  type ParentOrderRow,
  formatDate,
  formatPriceWithoutDots,
  normalizePhotoList,
  statusTone,
} from "./kid-details/kid-details-types";
import { KidDetailsSummary } from "./kid-details-summary";
import { KidEanUsagePanel } from "./kid-ean-usage-panel";
import { buildKidImageGalleryModel, mergeUniqueImageUrls } from "./image-gallery-model";
import {
  deleteOrder,
  fetchKidEanSummary,
  fetchInventoryRowsByKid,
  patchOrderAdditionalItems,
} from "./inventory-api";

export function KidDetailsView({ kidId }: { kidId: number }) {
  const t = useLabels();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<InventoryApiRow[]>([]);
  const [deletingOrderDbId, setDeletingOrderDbId] = useState<number | null>(null);
  const [deletingChildKey, setDeletingChildKey] = useState<string | null>(null);
  const [eanSummaryError, setEanSummaryError] = useState<string | null>(null);
  const [eanSummary, setEanSummary] = useState<{
    orderIds: string[];
    orderCount: number;
    skuEans: string[];
    skuEanCount: number;
    linkedProductsByEan: {
      xljv_services: Record<string, unknown[]>;
      hood_service: Record<string, unknown[]>;
    };
    listingSummary: {
      xljv_services: { total: number; sites: string[]; source_product_ids: string[] };
      hood_service: { total: number; accounts: string[] };
    };
    kidSnapshot: {
      place: string;
      room: string;
      furnitureType: string;
      listingStatus: string;
      mainPhoto: string;
      photoCount: number;
      lastUpdate: string;
    };
  } | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = (await fetchInventoryRowsByKid(kidId, 500)) as InventoryRowsApiResponse;
      const items = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
      setRows(items);
      try {
        const summary = await fetchKidEanSummary(kidId);
        setEanSummary({
          orderIds: summary.orderIds,
          orderCount: summary.orderCount,
          skuEans: summary.skuEans,
          skuEanCount: summary.skuEanCount,
          linkedProductsByEan: {
            xljv_services: summary.linkedProductsByEan.xljv_services,
            hood_service: summary.linkedProductsByEan.hood_service,
          },
          listingSummary: summary.listingSummary,
          kidSnapshot: summary.kidSnapshot,
        });
        setEanSummaryError(null);
      } catch (summaryError) {
        setEanSummary(null);
        setEanSummaryError(summaryError instanceof Error ? summaryError.message : t.kidEanSummaryUnavailable);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t.failedLoadKidDetails);
      setRows([]);
      setEanSummary(null);
      setEanSummaryError(null);
    } finally {
      setLoading(false);
    }
  }, [kidId, t.kidEanSummaryUnavailable]);

  useEffect(() => {
    void load();
  }, [load]);

  const kidMeta = useMemo(() => {
    const first = rows[0];
    if (!first) {
      return null;
    }
    return {
      kidNumber: first.kid_number || "-",
      kidAccount: first.kid_account || "-",
      place: eanSummary?.kidSnapshot.place || first.place || "-",
      room: eanSummary?.kidSnapshot.room || first.room || "-",
      furnitureType: eanSummary?.kidSnapshot.furnitureType || first.type || "-",
      listingStatus: eanSummary?.kidSnapshot.listingStatus || first.listing_status || "unlisted",
      gallery: buildKidImageGalleryModel(first.photo),
      photos:
        eanSummary?.kidSnapshot.mainPhoto
          ? mergeUniqueImageUrls([eanSummary.kidSnapshot.mainPhoto], normalizePhotoList(first.photo))
          : normalizePhotoList(first.photo),
      skuEans:
        eanSummary?.skuEans ??
        rows.flatMap((row) => (Array.isArray(row.sku_eans) ? row.sku_eans : [])).filter(Boolean),
      linkedProductsByEan:
        eanSummary?.linkedProductsByEan ??
        (rows.find((row) => row.linked_products_by_ean)?.linked_products_by_ean ?? { xljv_services: {}, hood_service: {} }),
      orderIds: eanSummary?.orderIds ?? [],
      skuEanCount: eanSummary?.skuEanCount ?? 0,
      listingSummary: eanSummary?.listingSummary ?? {
        xljv_services: { total: 0, sites: [], source_product_ids: [] },
        hood_service: { total: 0, accounts: [] },
      },
    };
  }, [rows, eanSummary]);

  const lastUpdate = useMemo(() => {
    if (eanSummary?.kidSnapshot.lastUpdate) {
      return formatDate(eanSummary.kidSnapshot.lastUpdate);
    }
    const dates = rows
      .map((row) => row.date)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      .map((value) => new Date(value))
      .filter((value) => !Number.isNaN(value.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());
    return dates[0] ? dates[0].toLocaleString() : "-";
  }, [rows, eanSummary]);

  const parentOrders = useMemo<ParentOrderRow[]>(() => {
    return rows
      .filter((item): item is InventoryApiRow & { order_db_id: number } => item.entity === "order" && typeof item.order_db_id === "number")
      .map((item) => ({
        id: item.id,
        orderDbId: item.order_db_id,
        parentOrderId: (item.parent_order_id || "-").trim() || "-",
        additionalOrderIdsText: (item.additional_order_ids_text || "-").trim() || "-",
        platform: (item.platform || "-").trim() || "-",
        quantity: typeof item.quantity === "number" ? String(item.quantity) : "-",
        title: item.title || "-",
        memo: (item.memo || "-").trim() || "-",
        sku: (item.sku || "-").trim() || "-",
        globalPrice: (item.global_price || "-").trim() || "-",
        status: item.status || "no_paid",
        date: formatDate(item.date),
        additionalItems: Array.isArray(item.additional_items) ? item.additional_items : []
      }));
  }, [rows]);

  async function handleDeleteParentOrder(orderDbId: number, parentOrderId: string) {
    if (deletingOrderDbId || deletingChildKey) return;
    const yes = window.confirm(`${t.delete} ${t.order.toLowerCase()} ${parentOrderId}?`);
    if (!yes) return;

    setDeletingOrderDbId(orderDbId);
    try {
      await deleteOrder(orderDbId);
      await load();
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : t.deleteFailed);
    } finally {
      setDeletingOrderDbId(null);
    }
  }

  async function handleDeleteChildOrder(parent: ParentOrderRow, childOrderId: string) {
    if (deletingOrderDbId || deletingChildKey) return;
    const yes = window.confirm(`${t.delete} ${t.childOrder.toLowerCase()} ${childOrderId} ${t.fromParent} ${parent.parentOrderId}?`);
    if (!yes) return;

    const childKey = `${parent.orderDbId}:${childOrderId}`;
    setDeletingChildKey(childKey);
    try {
      const nextAdditional = parent.additionalItems.filter(
        (item) => String(item.order_id || "").trim() !== childOrderId
      );
      await patchOrderAdditionalItems({
        orderDbId: parent.orderDbId,
        orderId: parent.parentOrderId,
        additionalItems: nextAdditional
      });
      await load();
    } catch (requestError) {
      window.alert(requestError instanceof Error ? requestError.message : t.childDeleteFailed);
    } finally {
      setDeletingChildKey(null);
    }
  }

  const {
    uploadingImages,
    retryingUpload,
    failedUploadFiles,
    pendingUploadSummary,
    pendingUploadNamesPreview,
    failedUploadNamesPreview,
    uploadRetryAttempt,
    uploadRetryCooldownUntil,
    lastDeletedImageUrl,
    savingMainImage,
    removingImage,
    reorderingImage,
    restoringImage,
    uploadInfo,
    draftEan,
    eanActionLoading,
    eanStatus,
    setDraftEan,
    handleUploadImages,
    handleRetryUpload,
    handleClearFailedUploadBatch,
    handleCopyFailedUploadNames,
    handleRestoreDeletedImage,
    handleClearPendingUploadBatch,
    handleTakeNextEan,
    handleReserveDraftEan,
    handleMoveImage,
    handleSetMainImage,
    handleDeleteImage,
    KID_UPLOAD_RETRY_MAX_ATTEMPTS,
  } = useKidDetailsMediaActions({
    t: t as unknown as Record<string, string>,
    kidId,
    kidMeta,
    load,
  });

  const [retryClockNow, setRetryClockNow] = useState(() => Date.now());
  useEffect(() => {
    if (uploadRetryCooldownUntil <= Date.now()) return;
    const id = window.setInterval(() => setRetryClockNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, [uploadRetryCooldownUntil]);

  const retryDiagnostics = useMemo(() => {
    if (failedUploadFiles.length === 0) return null;
    const remaining = Math.max(0, KID_UPLOAD_RETRY_MAX_ATTEMPTS - uploadRetryAttempt);
    const cooldownSeconds =
      uploadRetryCooldownUntil > retryClockNow
        ? Math.max(1, Math.ceil((uploadRetryCooldownUntil - retryClockNow) / 1000))
        : 0;
    return {
      attempt: uploadRetryAttempt,
      remaining,
      cooldownSeconds,
      max: KID_UPLOAD_RETRY_MAX_ATTEMPTS,
    };
  }, [failedUploadFiles.length, retryClockNow, uploadRetryAttempt, uploadRetryCooldownUntil, KID_UPLOAD_RETRY_MAX_ATTEMPTS]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-4 py-3">
        <Link
          href="/inventory"
          className="inline-flex h-9 items-center rounded-xl border border-border px-3 text-sm font-medium text-primary transition hover:bg-muted"
        >
          {t.backToInventory}
        </Link>
        <Button type="button" variant="secondary" className="h-10 px-4" onClick={() => void load()} disabled={loading}>
          {loading ? t.refreshing : t.refresh}
        </Button>
      </div>

      {error ? <ErrorState title="Inventory details failed" description={error} /> : null}
      {eanSummaryError ? <ErrorState title="EAN summary unavailable" description={eanSummaryError} /> : null}
      {uploadInfo ? <Card><CardContent className="p-4 text-sm text-muted-foreground">{uploadInfo}</CardContent></Card> : null}
      {eanStatus ? <Card><CardContent className="p-4 text-sm text-muted-foreground">{eanStatus}</CardContent></Card> : null}

      {kidMeta ? (
        <KidDetailsMainCard
          t={t as unknown as Record<string, string>}
          kidId={kidId}
          kidMeta={kidMeta}
          uploadingImages={uploadingImages}
          retryingUpload={retryingUpload}
          failedUploadFiles={failedUploadFiles}
          pendingUploadSummary={pendingUploadSummary}
          pendingUploadNamesPreview={pendingUploadNamesPreview}
          failedUploadNamesPreview={failedUploadNamesPreview}
          retryDiagnostics={retryDiagnostics}
          uploadRetryCooldownUntil={uploadRetryCooldownUntil}
          retryClockNow={retryClockNow}
          uploadRetryAttempt={uploadRetryAttempt}
          retryMaxAttempts={KID_UPLOAD_RETRY_MAX_ATTEMPTS}
          lastDeletedImageUrl={lastDeletedImageUrl}
          savingMainImage={savingMainImage}
          removingImage={removingImage}
          reorderingImage={reorderingImage}
          restoringImage={restoringImage}
          draftEan={draftEan}
          eanActionLoading={eanActionLoading}
          onDraftEanChange={setDraftEan}
          onUploadImages={handleUploadImages}
          onRetryUpload={handleRetryUpload}
          onClearFailedUploadBatch={handleClearFailedUploadBatch}
          onCopyFailedUploadNames={handleCopyFailedUploadNames}
          onRestoreDeletedImage={handleRestoreDeletedImage}
          onClearPendingUploadBatch={handleClearPendingUploadBatch}
          onTakeNextEan={handleTakeNextEan}
          onReserveDraftEan={handleReserveDraftEan}
          onMoveImage={handleMoveImage}
          onSetMainImage={handleSetMainImage}
          onDeleteImage={handleDeleteImage}
        />
      ) : loading ? null : (
        <EmptyState title={t.kidNotFoundInRows} description="No matching inventory rows were found for this KID." />
      )}

      {kidMeta ? (
        <KidDetailsSummary
          meta={{
            place: kidMeta.place,
            room: kidMeta.room,
            furnitureType: kidMeta.furnitureType,
            listingStatus: kidMeta.listingStatus,
            skuEans: kidMeta.skuEans,
            skuEanCount: kidMeta.skuEanCount,
            orderIds: kidMeta.orderIds,
            linkedProductsByEan: kidMeta.linkedProductsByEan,
            listingSummary: kidMeta.listingSummary,
            lastUpdate,
            orderCount: eanSummary?.orderCount ?? parentOrders.length,
            childOrderCount: parentOrders.reduce((acc, item) => acc + item.additionalItems.length, 0),
            gallery: kidMeta.gallery
          }}
        />
      ) : null}

      {kidMeta ? <KidEanUsagePanel eans={kidMeta.skuEans} /> : null}

      <KidDetailsOrdersCard
        t={t as unknown as Record<string, string>}
        loading={loading}
        parentOrders={parentOrders}
        deletingOrderDbId={deletingOrderDbId}
        deletingChildKey={deletingChildKey}
        formatPriceWithoutDots={formatPriceWithoutDots}
        statusTone={statusTone}
        onDeleteParentOrder={handleDeleteParentOrder}
        onDeleteChildOrder={handleDeleteChildOrder}
      />
    </div>
  );
}

