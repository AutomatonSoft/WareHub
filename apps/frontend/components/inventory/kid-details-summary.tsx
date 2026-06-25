"use client";

import { Badge } from "../shared/badge";
import { Card } from "../shared/card";
import { useLabels } from "../../app/use-labels";
import type { KidImageGalleryModel } from "./image-gallery-model";
import { normalizeEanOrFallback } from "./ean-utils";

type LinkedProductsByEan = {
  xljv_services?: Record<string, unknown[]>;
  hood_service?: Record<string, unknown[]>;
};

type KidSummaryMeta = {
  place: string;
  room: string;
  furnitureType: string;
  listingStatus: string;
  skuEans: string[];
  skuEanCount: number;
  orderIds: string[];
  linkedProductsByEan: LinkedProductsByEan;
  listingSummary: {
    xljv_services: { total: number; sites: string[]; source_product_ids: string[] };
    hood_service: { total: number; accounts: string[] };
  };
  lastUpdate: string;
  orderCount: number;
  childOrderCount: number;
  gallery: KidImageGalleryModel;
};

function normalizeLabel(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : "-";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    const normalized = value
      .map((item) => (typeof item === "string" ? item.trim() : typeof item === "number" && Number.isFinite(item) ? String(item) : ""))
      .filter(Boolean)
      .join(", ");
    return normalized || "-";
  }
  return "-";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function toText(value: unknown, fallback = "-"): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

export function KidDetailsSummary({ meta }: { meta: KidSummaryMeta }) {
  const t = useLabels();
  const listingTone = meta.listingStatus === "listed" ? "success" : "warning";
  const eans = meta.skuEans.length > 0 ? meta.skuEans.map((value) => normalizeEanOrFallback(value)) : [];
  const completenessChecks = [
    { label: t.readinessPlace, ok: normalizeLabel(meta.place) !== "-" },
    { label: t.readinessRoom, ok: normalizeLabel(meta.room) !== "-" },
    { label: t.readinessType, ok: normalizeLabel(meta.furnitureType) !== "-" },
    { label: t.readinessMainPhoto, ok: meta.gallery.items.length > 0 },
    { label: t.readinessEan, ok: eans.length > 0 },
    { label: t.readinessLinkedOrder, ok: meta.orderIds.length > 0 },
    { label: t.readinessListingLinked, ok: meta.listingSummary.xljv_services.total + meta.listingSummary.hood_service.total > 0 },
  ];
  const completedChecks = completenessChecks.filter((item) => item.ok).length;
  const completenessPercent = Math.round((completedChecks / completenessChecks.length) * 100);
  const missingChecks = completenessChecks.filter((item) => !item.ok);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-3 lg:col-span-2">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.productReadinessScore}</div>
        <div className="text-2xl font-semibold text-[color:var(--text-primary)]">{completenessPercent}%</div>
        {missingChecks.length === 0 ? (
          <div className="text-sm text-[color:var(--success)]">{t.readinessAllGood}</div>
        ) : (
          <div className="space-y-1 text-sm text-[color:var(--text-secondary)]">
            <div className="font-medium text-[color:var(--text-primary)]">{t.readinessMissing}:</div>
            <ul className="list-disc pl-5">
              {missingChecks.map((item) => (
                <li key={item.label}>{item.label}</li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.warehouseSnapshot}</div>
        <div className="grid gap-2 text-sm md:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            Place: <span className="font-semibold">{normalizeLabel(meta.place)}</span>
          </div>
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            Room: <span className="font-semibold">{normalizeLabel(meta.room)}</span>
          </div>
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            Type: <span className="font-semibold">{normalizeLabel(meta.furnitureType)}</span>
          </div>
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            Listing: <Badge tone={listingTone}>{normalizeLabel(meta.listingStatus)}</Badge>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.orderIdentity}</div>
        {meta.orderIds.length === 0 ? (
          <div className="text-sm text-[color:var(--text-muted)]">{t.noParentOrderIdsLinked}</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {meta.orderIds.map((orderId) => (
              <span key={orderId} className="rounded-full border border-[color:var(--outline)] px-2 py-1 text-xs font-mono">
                {orderId}
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.listingSummary}</div>
        <div className="space-y-2 text-sm">
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            {t.xljvLinks}: <span className="font-semibold">{meta.listingSummary.xljv_services.total}</span>
            <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
              {t.listingSites}: {meta.listingSummary.xljv_services.sites.join(", ") || "-"}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            {t.hoodLinks}: <span className="font-semibold">{meta.listingSummary.hood_service.total}</span>
            <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
              {t.accounts}: {meta.listingSummary.hood_service.accounts.join(", ") || "-"}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            {t.xljvSourceProductIds}:{" "}
            <span className="font-semibold">{meta.listingSummary.xljv_services.source_product_ids.length}</span>
          </div>
        </div>
      </Card>

      <Card className="space-y-3">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.eanMarketplaceIdentity}</div>
        {eans.length === 0 ? (
          <div className="text-sm text-[color:var(--text-muted)]">{t.noEanLinkedFromAttachedOrders}</div>
        ) : (
          <div className="space-y-2">
            {eans.map((ean) => {
              const xljv = meta.linkedProductsByEan.xljv_services?.[ean] ?? [];
              const hood = meta.linkedProductsByEan.hood_service?.[ean] ?? [];
              return (
                <div key={ean} className="rounded-xl border border-[color:var(--outline)] px-3 py-2 text-sm">
                  <div className="font-mono font-semibold text-[color:var(--text-primary)]">{ean}</div>
                  <div className="mt-1 text-xs text-[color:var(--text-secondary)]">
                    XL/JV links: {xljv.length} | Hood links: {hood.length}
                  </div>
                  {xljv.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-[color:var(--text-secondary)]">
                      {xljv.map((entry, index) => {
                        const row = asRecord(entry);
                        const site = toText(row?.site);
                        const sourceProductId = toText(row?.source_product_id);
                        const sourceSku = toText(row?.source_sku);
                        const statusRaw = row?.status;
                        const statusText =
                          typeof statusRaw === "boolean" ? (statusRaw ? "active" : "inactive") : toText(statusRaw);
                        return (
                          <div key={`${ean}-xljv-${index}`} className="rounded border border-[color:var(--outline)] px-2 py-1">
                            XL/JV [{site}] product_id: {sourceProductId} | sku: {sourceSku} | status: {statusText}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {hood.length > 0 ? (
                    <div className="mt-2 space-y-1 text-xs text-[color:var(--text-secondary)]">
                      {hood.map((entry, index) => {
                        const row = asRecord(entry);
                        const account = toText(row?.account);
                        const status = toText(row?.status);
                        const successRaw = row?.success;
                        const successText =
                          typeof successRaw === "boolean" ? (successRaw ? "success" : "failed") : toText(successRaw);
                        return (
                          <div key={`${ean}-hood-${index}`} className="rounded border border-[color:var(--outline)] px-2 py-1">
                            Hood [{account}] status: {status} | push: {successText}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="space-y-3 lg:col-span-2">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.marketplaceIdentityMap}</div>
        <div className="grid gap-2 text-xs md:grid-cols-2">
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            <div className="font-medium text-[color:var(--text-primary)]">{t.identityKid}</div>
            <div className="mt-1 text-[color:var(--text-secondary)]">{meta.orderIds.length > 0 ? meta.orderIds.join(", ") : "-"}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            <div className="font-medium text-[color:var(--text-primary)]">{t.identityEan}</div>
            <div className="mt-1 text-[color:var(--text-secondary)]">{eans.length > 0 ? eans.join(", ") : "-"}</div>
          </div>
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            <div className="font-medium text-[color:var(--text-primary)]">{t.identityXljv}</div>
            <div className="mt-1 text-[color:var(--text-secondary)]">
              {meta.listingSummary.xljv_services.total} | {t.listingSites}: {meta.listingSummary.xljv_services.sites.join(", ") || "-"}
            </div>
          </div>
          <div className="rounded-xl border border-[color:var(--outline)] px-3 py-2">
            <div className="font-medium text-[color:var(--text-primary)]">{t.identityHood}</div>
            <div className="mt-1 text-[color:var(--text-secondary)]">
              {meta.listingSummary.hood_service.total} | {t.accounts}: {meta.listingSummary.hood_service.accounts.join(", ") || "-"}
            </div>
          </div>
        </div>
      </Card>

      <Card className="space-y-3 lg:col-span-2">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.imageGalleryMinimalModel}</div>
        {meta.gallery.items.length === 0 ? (
          <div className="text-sm text-[color:var(--text-muted)]">{t.noImagesInGallery}</div>
        ) : (
          <div className="space-y-2">
            {meta.gallery.items.map((item) => (
              <div key={item.id} className="rounded-xl border border-[color:var(--outline)] px-3 py-2 text-xs">
                order: {item.order} | main: {item.isMain ? "yes" : "no"} | source: {item.source} | status: {item.status} | retry:{" "}
                {item.retryState}
                <div className="mt-1 truncate text-[color:var(--text-secondary)]">{item.publicUrl}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="space-y-3 lg:col-span-2">
        <div className="text-sm font-semibold text-[color:var(--text-primary)]">{t.lastUpdateActionHistory}</div>
        <div className="text-sm">
          {t.lastUpdateLabel}: <span className="font-semibold">{meta.lastUpdate}</span>
        </div>
        <ul className="space-y-1 text-sm text-[color:var(--text-secondary)]">
          <li>Orders attached: {meta.orderCount}</li>
          <li>Child orders attached: {meta.childOrderCount}</li>
          <li>Linked EAN count: {meta.skuEanCount || eans.length}</li>
          <li>Marketplace write actions from this page: disabled (read-only summary).</li>
        </ul>
      </Card>
    </div>
  );
}

