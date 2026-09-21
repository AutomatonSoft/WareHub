"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { CreateProductImageGallery, type CreateProductGalleryItem } from "../../app/create-product/create-product-image-gallery";
import { uploadProductImages } from "../editor/product-image-api";
import type { ProductEditorEbayDraft, ProductEditorWarning } from "./product-editor-types";

type Props = {
  draft: ProductEditorEbayDraft;
  accountLabel: string;
  warnings: ProductEditorWarning[];
  loading: boolean;
  applyLoading: boolean;
  changedFields: string[];
  onChange: (patch: Partial<ProductEditorEbayDraft>) => void;
  onApply: () => void;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item ?? "").trim()).filter(Boolean) : [];
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="space-y-1.5 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function EbayImageGallery({ imageUrls, onChange }: { imageUrls: string[]; onChange: (next: string[]) => void }) {
  const items = imageUrls.map((src, index): CreateProductGalleryItem => ({ id: `${index}:${src}`, src, isLocal: false }));
  const [activeItemId, setActiveItemId] = useState(items[0]?.id ?? "");
  const [uploadError, setUploadError] = useState("");
  useEffect(() => setActiveItemId((current) => items.some((item) => item.id === current) ? current : (items[0]?.id ?? "")), [items]);
  return <div className="space-y-2"><CreateProductImageGallery
    items={items}
    activeItemId={activeItemId}
    previewAlt="eBay product image preview"
    emptyPreviewLabel="No image"
    emptyGalleryLabel="No gallery images"
    thumbnailAlt={(index) => `eBay product image ${index + 1}`}
    deleteAlt={(index) => `Delete eBay product image ${index + 1}`}
    onActiveItemChange={setActiveItemId}
    uploadLabel="Upload images"
    onFilesSelected={(files) => {
      const selected = Array.from(files ?? []);
      if (!selected.length) return;
      setUploadError("");
      void uploadProductImages(selected).then((uploaded) => onChange([...imageUrls, ...uploaded])).catch(() => setUploadError("Image upload failed. Try again."));
    }}
    onDeleteItem={(itemId) => onChange(items.filter((item) => item.id !== itemId).map((item) => item.src))}
    onMoveItem={(sourceItemId, targetItemId) => {
      const sourceIndex = items.findIndex((item) => item.id === sourceItemId);
      const targetIndex = items.findIndex((item) => item.id === targetItemId);
      if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
      const next = [...imageUrls];
      const [moved] = next.splice(sourceIndex, 1);
      next.splice(targetIndex, 0, moved);
      onChange(next);
    }}
  />{uploadError ? <p className="text-sm text-destructive">{uploadError}</p> : null}</div>;
}

export function ProductEditorEbayPanel(props: Props) {
  const canApply = props.isEanValid && props.changedFields.length > 0 && !props.loading && !props.applyLoading;
  const inventoryItem = asRecord(props.draft.ebay_inventory_item);
  const product = asRecord(inventoryItem.product);
  const offer = asRecord(props.draft.ebay_offer);
  const policies = asRecord(offer.listingPolicies);
  const legacyItem = asRecord(props.draft.ebay_legacy_item);
  const [aspectsText, setAspectsText] = useState(() => JSON.stringify(asRecord(product.aspects), null, 2));
  const [legacyItemSpecificsText, setLegacyItemSpecificsText] = useState(() => JSON.stringify(asRecord(legacyItem.item_specifics), null, 2));
  const [aspectsError, setAspectsError] = useState("");

  useEffect(() => {
    setAspectsText(JSON.stringify(asRecord(asRecord(props.draft.ebay_inventory_item).product).aspects, null, 2));
    setAspectsError("");
    setLegacyItemSpecificsText(JSON.stringify(asRecord(asRecord(props.draft.ebay_legacy_item).item_specifics), null, 2));
  }, [props.draft.ean, props.draft.target_id]);

  function updateInventoryItem(patch: Record<string, unknown>) {
    props.onChange({ ebay_inventory_item: { ...inventoryItem, ...patch } });
  }

  function updateProduct(patch: Record<string, unknown>) {
    updateInventoryItem({ product: { ...product, ...patch } });
  }

  function updateOffer(patch: Record<string, unknown>) {
    props.onChange({ ebay_offer: { ...offer, ...patch } });
  }

  function updatePolicies(patch: Record<string, unknown>) {
    updateOffer({ listingPolicies: { ...policies, ...patch } });
  }

  function updateLegacyItem(patch: Record<string, unknown>) {
    props.onChange({ ebay_legacy_item: { ...legacyItem, ...patch } });
  }

  function commitAspects() {
    try {
      const parsed = JSON.parse(aspectsText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid aspects");
      updateProduct({ aspects: parsed });
      setAspectsError("");
    } catch {
      setAspectsError("Aspects must be a JSON object, for example {\"Brand\":[\"Depotum\"]}.");
    }
  }

  function commitLegacyItemSpecifics() {
    try {
      const parsed = JSON.parse(legacyItemSpecificsText);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("invalid item specifics");
      updateLegacyItem({ item_specifics: parsed });
    } catch {
      setAspectsError("Item specifics must be a JSON object, for example {\"Brand\":[\"Depotum\"]}.");
    }
  }

  return (
    <div className="space-y-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[240px] flex-1 space-y-1.5 text-sm font-medium">
          EAN
          <Input value={props.eanValue} onChange={(event) => props.onChangeEan(event.target.value)} placeholder="EAN" />
        </label>
        <Button type="button" variant="outline" onClick={props.onSearch} disabled={!props.isEanValid || props.searching}>
          {props.searching ? "Loading" : "Load eBay listing"}
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <FormField label="Account"><Input value={props.accountLabel} readOnly /></FormField>
        <FormField label="Listing mode">
          <select
            className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm"
            value={props.draft.ebay_listing_mode}
            onChange={(event) => props.onChange({ ebay_listing_mode: event.target.value === "legacy" ? "legacy" : "inventory" })}
          >
            <option value="inventory">Inventory</option>
            <option value="legacy">Legacy FixedPriceItem</option>
          </select>
        </FormField>
        <FormField label="Price"><Input inputMode="decimal" value={props.draft.price} onChange={(event) => props.onChange({ price: event.target.value })} /></FormField>
        <FormField label="Quantity"><Input inputMode="numeric" value={props.draft.quantity} onChange={(event) => props.onChange({ quantity: event.target.value })} /></FormField>
      </div>

      {props.draft.ebay_listing_mode === "legacy" ? (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Legacy Item ID"><Input value={props.draft.ebay_item_id} onChange={(event) => props.onChange({ ebay_item_id: event.target.value })} placeholder="Required for legacy listings outside the first page" /></FormField>
            <FormField label="Variation SKU"><Input value={props.draft.ebay_variation_sku} onChange={(event) => props.onChange({ ebay_variation_sku: event.target.value })} placeholder="Only for legacy variations" /></FormField>
            <FormField label="Title"><Input value={String(legacyItem.title ?? "")} onChange={(event) => updateLegacyItem({ title: event.target.value })} /></FormField>
            <FormField label="Category ID"><Input value={String(legacyItem.category_id ?? "")} onChange={(event) => updateLegacyItem({ category_id: event.target.value })} /></FormField>
          </div>
          <FormField label="Description"><textarea className="min-h-32 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={String(legacyItem.description ?? "")} onChange={(event) => updateLegacyItem({ description: event.target.value })} /></FormField>
          <FormField label="Image URLs (one per line)"><textarea className="min-h-28 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={stringArray(legacyItem.image_urls).join("\n")} onChange={(event) => updateLegacyItem({ image_urls: event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) })} /></FormField>
          <EbayImageGallery imageUrls={stringArray(legacyItem.image_urls)} onChange={(image_urls) => updateLegacyItem({ image_urls })} />
          <FormField label="Item specifics (JSON)"><textarea className="min-h-36 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 font-mono text-xs" value={legacyItemSpecificsText} onChange={(event) => setLegacyItemSpecificsText(event.target.value)} onBlur={commitLegacyItemSpecifics} /></FormField>
          <p className="text-xs text-amber-700">eBay can reject title or category changes after a sale or close to the listing end time. Item specifics replace the complete current set, so keep all required values.</p>
        </>
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Title"><Input value={String(product.title ?? "")} onChange={(event) => updateProduct({ title: event.target.value })} /></FormField>
            <FormField label="Condition"><Input value={String(inventoryItem.condition ?? "")} onChange={(event) => updateInventoryItem({ condition: event.target.value })} placeholder="NEW" /></FormField>
            <FormField label="Category ID"><Input value={String(offer.categoryId ?? "")} onChange={(event) => updateOffer({ categoryId: event.target.value })} /></FormField>
            <FormField label="Merchant location key"><Input value={String(offer.merchantLocationKey ?? "")} onChange={(event) => updateOffer({ merchantLocationKey: event.target.value })} /></FormField>
          </div>
          <FormField label="Description"><textarea className="min-h-32 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={String(product.description ?? "")} onChange={(event) => updateProduct({ description: event.target.value })} /></FormField>
          <FormField label="Image URLs (one per line)"><textarea className="min-h-28 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={stringArray(product.imageUrls).join("\n")} onChange={(event) => updateProduct({ imageUrls: event.target.value.split(/\r?\n/).map((value) => value.trim()).filter(Boolean) })} /></FormField>
          <EbayImageGallery imageUrls={stringArray(product.imageUrls)} onChange={(imageUrls) => updateProduct({ imageUrls })} />
          <FormField label="Category aspects (JSON)"><textarea className="min-h-36 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 font-mono text-xs" value={aspectsText} onChange={(event) => setAspectsText(event.target.value)} onBlur={commitAspects} /></FormField>
          {aspectsError ? <p className="text-sm text-destructive">{aspectsError}</p> : null}
          <div className="grid gap-3 md:grid-cols-2">
            <FormField label="Fulfillment policy ID"><Input value={String(policies.fulfillmentPolicyId ?? "")} onChange={(event) => updatePolicies({ fulfillmentPolicyId: event.target.value })} /></FormField>
            <FormField label="Payment policy ID"><Input value={String(policies.paymentPolicyId ?? "")} onChange={(event) => updatePolicies({ paymentPolicyId: event.target.value })} /></FormField>
            <FormField label="Return policy ID"><Input value={String(policies.returnPolicyId ?? "")} onChange={(event) => updatePolicies({ returnPolicyId: event.target.value })} /></FormField>
            <FormField label="Listing duration"><Input value={String(offer.listingDuration ?? "")} onChange={(event) => updateOffer({ listingDuration: event.target.value })} placeholder="GTC" /></FormField>
          </div>
        </>
      )}

      {props.warnings.map((warning) => <p key={warning.code} className="text-sm text-amber-700">{warning.message}</p>)}
      <p className="text-xs text-muted-foreground">Legacy content updates are available only for non-variation listings and remain subject to eBay revision restrictions.</p>
      <Button type="button" onClick={props.onApply} disabled={!canApply}>
        {props.applyLoading ? "Applying" : "Review and apply eBay changes"}
      </Button>
    </div>
  );
}
