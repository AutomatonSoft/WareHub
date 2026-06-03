"use client";

import { Dispatch, SetStateAction, SyntheticEvent, useMemo } from "react";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "../shared/button";
import { Card } from "../shared/card";
import { FormField } from "../shared/form-field";
import { Input } from "../shared/input";
import { Site, XLJVProduct, toNumberOrNull } from "./xljv-edit-utils";
import {
  JvContent,
  SectionHeader,
  ToggleField,
  toggleInactive,
  toggleIsSofort,
  updateJvField
} from "./xljv-edit-form-shared";
import { toXljvImageUrl } from "./xljv-image-utils";

type CommonProps = {
  form: XLJVProduct;
  site: Site;
  setForm: Dispatch<SetStateAction<XLJVProduct | null>>;
  computedUvp: string;
  getJvContent: (languageCode: string) => JvContent;
  setJvContentField: (languageCode: string, field: string, value: string) => void;
};

type DeliveryProps = {
  deliveryOptions: Array<{ id: number; label: string; is_default?: boolean }>;
  deliveryOptionsLoading: boolean;
};

export function ProductGalleryCard({
  form,
  site,
  siteKey,
  setForm,
  imageUrls,
  displayImageUrl,
  activeImageUrl,
  setActiveImageUrl,
  imageUploadLoading,
  onUploadImages
}: {
  form: XLJVProduct;
  site: Site;
  siteKey: string;
  setForm: Dispatch<SetStateAction<XLJVProduct | null>>;
  imageUrls: string[];
  displayImageUrl: string;
  activeImageUrl: string;
  setActiveImageUrl: Dispatch<SetStateAction<string>>;
  imageUploadLoading: boolean;
  onUploadImages: (files: FileList | null, imageRole?: "main" | "additional") => Promise<void>;
}) {
  function toPreviewUrl(value: string): string {
    return toXljvImageUrl(site, siteKey, value);
  }

  const normalizedImageUrls = imageUrls.map((url) => toPreviewUrl(url)).filter(Boolean);
  const uniqueImageUrls = useMemo(() => Array.from(new Set(normalizedImageUrls)), [normalizedImageUrls]);
  const normalizedDisplayImageUrl = toPreviewUrl(displayImageUrl);
  const displayCandidate = uniqueImageUrls.includes(normalizedDisplayImageUrl)
    ? normalizedDisplayImageUrl
    : (uniqueImageUrls[0] || "");
  const fallbackSvg =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#eef1fb"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#7b86a8" font-family="Arial,sans-serif" font-size="24">Image unavailable</text></svg>`
    );

  function onImageError(event: SyntheticEvent<HTMLImageElement>) {
    const target = event.currentTarget;
    if (target.src !== fallbackSvg) target.src = fallbackSvg;
  }

  function deleteImage(url: string) {
    const normalizedTarget = toPreviewUrl(url);
    setForm((current) => {
      if (!current) return current;
      const nextImages = (current.images || []).filter((row) => toPreviewUrl(String(row.image || "").trim()) !== normalizedTarget);
      const nextMain = toPreviewUrl(String(current.image || "")) === normalizedTarget ? nextImages[0]?.image || "" : current.image;
      return { ...current, image: nextMain, images: nextImages };
    });
    if (toPreviewUrl(activeImageUrl) === normalizedTarget) setActiveImageUrl("");
  }

  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <SectionHeader title="Product Gallery" badge="Images" description="Manage product images, delete old images, upload new product photos." />
      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.06)]">
        {displayCandidate ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={displayCandidate}
            src={displayCandidate}
            alt="Main product"
            className="h-full w-full object-cover"
            onError={onImageError}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--text-muted)]">No main image</div>
        )}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2 min-[1500px]:grid-cols-4">
        {uniqueImageUrls.length > 0 ? uniqueImageUrls.map((url, index) => (
          <div key={`${url}-${index}`} className={`group relative aspect-square overflow-hidden rounded-xl border bg-[color:rgba(129,135,255,0.06)] ${(toPreviewUrl(activeImageUrl) || uniqueImageUrls[0]) === url ? "border-[color:var(--primary)]" : "border-[color:var(--outline)]"}`}>
            <button type="button" className="h-full w-full" onClick={() => setActiveImageUrl(url)}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={`Product thumbnail ${index + 1}`}
                className="h-full w-full object-cover"
                onError={onImageError}
              />
            </button>
            <button type="button" aria-label="Delete image" onClick={() => deleteImage(url)} className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1 text-red-600 shadow-sm opacity-100 transition hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100">
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </div>
        )) : (
          <div className="col-span-full rounded-xl border border-dashed border-[color:var(--outline)] p-4 text-center text-sm text-[color:var(--text-muted)]">No thumbnails</div>
        )}
      </div>
      <label tabIndex={0} className="mt-4 block cursor-pointer rounded-xl border border-dashed border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.05)] p-4 text-center focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]">
        <ImagePlus size={22} className="mx-auto mb-2 text-[color:var(--primary)]" aria-hidden="true" />
        <div className="text-sm font-semibold">Drag images here or click to add gallery images</div>
        <div className="mt-1 text-xs text-[color:var(--text-muted)]">{imageUploadLoading ? "Uploading..." : "Additional images will not replace the main image"}</div>
        <input id="jv-additional-image-upload-input" type="file" accept="image/*" multiple className="sr-only" disabled={imageUploadLoading} onChange={(event) => void onUploadImages(event.target.files, "additional")} />
      </label>
      <input id="jv-main-image-upload-input" type="file" accept="image/*" className="sr-only" disabled={imageUploadLoading} onChange={(event) => void onUploadImages(event.target.files, "main")} />
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button type="button" variant="secondary" disabled={imageUploadLoading} onClick={() => document.getElementById("jv-main-image-upload-input")?.click()}>
          Upload main image
        </Button>
        <Button type="button" variant="secondary" disabled={imageUploadLoading} onClick={() => document.getElementById("jv-additional-image-upload-input")?.click()}>
          Add additional images
        </Button>
      </div>
      <FormField label={site === "XL" ? "Main image path (oc_product.image)" : "Main image URL"} className="mt-4 ui-form-field">
        {(fieldProps) => (
          <Input {...fieldProps} value={form.image || ""} onChange={(event) => setForm((current) => (current ? { ...current, image: event.target.value } : current))} />
        )}
      </FormField>
    </Card>
  );
}

export function QuickProductDataCard({ form, site, setForm, computedUvp, getJvContent, setJvContentField, saving }: CommonProps & { saving: boolean }) {
  const isJv = site === "JV";
  const primaryDescription = (form.descriptions || [])[0] || {};
  function updateXlDescriptionName(value: string) {
    setForm((current) => {
      if (!current) return current;
      const rows = [...(current.descriptions || [])];
      rows[0] = { ...(rows[0] || { language_id: 1 }), name: value };
      return { ...current, descriptions: rows };
    });
  }
  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <SectionHeader title="Quick Product Data" badge="Fast edit" description="Most frequently changed product fields." />
      <div className="space-y-3">
        <FormField label="Name">
          {(p) => (
            <Input
              {...p}
              value={isJv ? (getJvContent("de").name || "") : (primaryDescription.name || "")}
              onChange={(event) => isJv ? setJvContentField("de", "name", event.target.value) : updateXlDescriptionName(event.target.value)}
            />
          )}
        </FormField>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          <FormField label="Price">{(p) => <Input {...p} value={String(form.price ?? "")} onChange={(event) => setForm((current) => (current ? { ...current, price: event.target.value } : current))} />}</FormField>
          {isJv ? <FormField label="UVP">{(p) => <Input {...p} value={computedUvp} readOnly disabled />}</FormField> : null}
        </div>
        <FormField label="EAN">{(p) => <Input {...p} value={isJv ? (form.jv_fields?.ean || form.ean || "") : (form.source_ean_field || form.ean || "")} readOnly />}</FormField>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-2">
          {isJv ? (
            <FormField label="Artikel Nr">{(p) => <Input {...p} value={form.jv_fields?.artikelnr || ""} onChange={(event) => updateJvField(setForm, "artikelnr", event.target.value)} />}</FormField>
          ) : (
            <FormField label="Model">{(p) => <Input {...p} value={form.source_model || ""} onChange={(event) => setForm((current) => (current ? { ...current, source_model: event.target.value } : current))} />}</FormField>
          )}
          <FormField label={isJv ? "SKU" : "OpenCart SKU"}>{(p) => <Input {...p} value={form.source_sku || ""} onChange={(event) => setForm((current) => (current ? { ...current, source_sku: event.target.value } : current))} />}</FormField>
        </div>
        <FormField label="Manufacturer ID">{(p) => <Input {...p} value={String(form.manufacturer_id ?? "")} onChange={(event) => setForm((current) => current ? { ...current, manufacturer_id: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
      </div>
      <Button type="submit" loading={saving} className="mt-5 w-full">Save Changes</Button>
    </Card>
  );
}

export function StatusAvailabilityCard({ form, site, setForm, deliveryOptions, deliveryOptionsLoading }: CommonProps & DeliveryProps) {
  const isJv = site === "JV";
  if (!isJv) {
    return (
      <Card className="rounded-xl p-5 shadow-sm">
        <SectionHeader title="OpenCart Status" badge="XL source" description="Fields stored in oc_product for stock, tax and active status." />
        <div className="space-y-3">
          <ToggleField label="status active" checked={Boolean(form.status)} onChange={() => setForm((current) => current ? { ...current, status: !Boolean(current.status) } : current)} />
          <ToggleField label="Lieferung erforderlich" checked={form.shipping ?? true} onChange={() => setForm((current) => current ? { ...current, shipping: !(current.shipping ?? true) } : current)} />
          <ToggleField label="Vom Lager abziehen" checked={form.subtract ?? true} onChange={() => setForm((current) => current ? { ...current, subtract: !(current.subtract ?? true) } : current)} />
          <FormField label="quantity">{(p) => <Input {...p} value={String(form.quantity ?? "")} onChange={(event) => setForm((current) => current ? { ...current, quantity: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
          <FormField label="stock_status_id">{(p) => <Input {...p} value={String(form.stock_status_id ?? "")} onChange={(event) => setForm((current) => current ? { ...current, stock_status_id: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
          <FormField label="tax_class_id">{(p) => <Input {...p} value={String(form.tax_class_id ?? "")} onChange={(event) => setForm((current) => current ? { ...current, tax_class_id: toNumberOrNull(event.target.value) ?? undefined } : current)} />}</FormField>
          <FormField label="date_available">{(p) => <Input {...p} value={form.date_available || ""} onChange={(event) => setForm((current) => current ? { ...current, date_available: event.target.value } : current)} />}</FormField>
        </div>
      </Card>
    );
  }
  return (
    <Card className="rounded-xl p-5 shadow-sm">
      <SectionHeader title="Status & Availability" badge="Marketplace status" description="Control price filters, delivery status, tax and stock options." />
      <div className="space-y-3">
        <FormField label="Preisbasis">{(p) => <Input {...p} value={form.jv_fields?.preisbasis || ""} onChange={(event) => updateJvField(setForm, "preisbasis", event.target.value)} />}</FormField>
        <FormField label="Preisfilter">{(p) => <Input {...p} value={form.jv_fields?.preisfilter || ""} onChange={(event) => updateJvField(setForm, "preisfilter", event.target.value)} />}</FormField>
        <FormField label="Verfugbarkeit / Lieferzeit">
          {(p) => (
            <select {...p} className="ui-select h-11 w-full rounded-xl border border-[color:var(--outline)] bg-[color:var(--panel)] px-3 text-sm" value={String(form.jv_fields?.lieferzeitid ?? "")} onChange={(event) => updateJvField(setForm, "lieferzeitid", event.target.value)}>
              <option value="">Select delivery time</option>
              {deliveryOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          )}
        </FormField>
        <ToggleField label="is_sofort" checked={Boolean(form.jv_fields?.is_sofort)} onChange={() => toggleIsSofort(setForm)} />
        <ToggleField label="in_active" checked={Number(form.jv_fields?.inaktiv ?? 0) !== 1} onChange={() => toggleInactive(setForm)} />
        <FormField label="MwSt ID">{(p) => <Input {...p} value={String(form.jv_fields?.mwstid ?? "")} onChange={(event) => updateJvField(setForm, "mwstid", event.target.value)} />}</FormField>
        {deliveryOptionsLoading ? <div className="text-xs text-[color:var(--text-muted)]">Loading delivery options...</div> : null}
      </div>
    </Card>
  );
}
