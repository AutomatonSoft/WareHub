"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ProductEditorEbaySpecifics } from "../../components/product-editor/product-editor-ebay-specifics";
import { apiFetch } from "../../lib/api/client";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";
import { JvDescriptionEditor } from "./jv-description-editor";
import type { EbayCreateFields } from "./create-product-model";
import { EbayCategoryPicker } from "./ebay-category-picker";

type EbayAccount = "JV" | "XL" | "DEP";
type EbayLocation = { merchantLocationKey?: string; location?: { address?: { postalCode?: string; city?: string; stateOrProvince?: string; country?: string } } };
type EbayFulfillmentPolicy = { fulfillmentPolicyId?: string; name?: string; handlingTime?: { value?: number; unit?: string }; shippingOptions?: Array<{ optionType?: string; shippingServices?: Array<{ shippingServiceCode?: string; shippingCost?: { value?: string; currency?: string }; freeShipping?: boolean }> }> };
type SellerSetup = { locations?: { locations?: EbayLocation[] }; fulfillment_policies?: { fulfillmentPolicies?: EbayFulfillmentPolicy[] }; payment_policies?: { paymentPolicies?: Array<{ paymentPolicyId?: string; name?: string }> }; return_policies?: { returnPolicies?: Array<{ returnPolicyId?: string; name?: string; returnPeriod?: { value?: number; unit?: string }; returnShippingCostPayer?: string }> } };

type Props = {
  account: EbayAccount;
  draftKey: string;
  draftVersion: number;
  initialFields: EbayCreateFields;
  onDraftChange: (fields: EbayCreateFields) => void;
  sourceLoading: boolean;
  onLoadSource: (ean: string) => void;
};

function addressLabel(location: EbayLocation): string {
  const address = location.location?.address;
  return [address?.postalCode || address?.city, address?.stateOrProvince, address?.country].filter(Boolean).join(", ") || "Address unavailable";
}

function fulfillmentLabel(policy: EbayFulfillmentPolicy): string {
  const services = (policy.shippingOptions ?? []).flatMap((option) => (option.shippingServices ?? []).map((service) => {
    const cost = service.freeShipping ? "free" : [service.shippingCost?.value, service.shippingCost?.currency].filter(Boolean).join(" ");
    return [option.optionType, service.shippingServiceCode, cost].filter(Boolean).join(": ");
  }));
  const handling = policy.handlingTime?.value == null ? "" : `${policy.handlingTime.value} ${policy.handlingTime.unit ?? "DAY"}`;
  return [policy.name, handling, services.join("; ")].filter(Boolean).join(" — ");
}

function parseAspects(value: string): Record<string, string[]> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).flatMap(([name, values]) => {
      const normalized = Array.isArray(values) ? values.map((item) => String(item)) : [];
      return normalized.length ? [[name, normalized]] : [];
    }));
  } catch {
    return {};
  }
}

function apiError(response: Response, payload: unknown): string {
  if (payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string") return payload.detail;
  return `HTTP ${response.status}`;
}

export function EbaySellerSetupPanel({ account, draftKey, draftVersion, initialFields, onDraftChange, sourceLoading, onLoadSource }: Props) {
  const [setup, setSetup] = useState<SellerSetup | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<EbayCreateFields>(initialFields);
  const [descriptionMode, setDescriptionMode] = useState<"code" | "preview">("preview");
  const [aspectValues, setAspectValues] = useState<Record<string, string[]>>({});
  const onDraftChangeRef = useRef(onDraftChange);

  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => { setFields(initialFields); setAspectValues(parseAspects(initialFields.aspectsText)); }, [draftKey, draftVersion, initialFields]);
  useEffect(() => { setDescriptionMode("preview"); }, [draftKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setSetup(null);
    void (async () => {
      try {
        const response = await apiFetch(`/api/v1/ebay/seller/setup/?account=${account.toLowerCase()}&marketplace_id=EBAY_DE`, { method: "GET" });
        const payload: unknown = await response.json();
        if (!response.ok) throw new Error(apiError(response, payload));
        setSetup(payload as SellerSetup);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "eBay seller setup could not be loaded.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [account]);

  const locations = useMemo(() => setup?.locations?.locations ?? [], [setup]);
  const fulfillmentPolicies = useMemo(() => setup?.fulfillment_policies?.fulfillmentPolicies ?? [], [setup]);
  const paymentPolicies = useMemo(() => setup?.payment_policies?.paymentPolicies ?? [], [setup]);
  const returnPolicies = useMemo(() => setup?.return_policies?.returnPolicies ?? [], [setup]);

  function updateField<Key extends keyof EbayCreateFields>(key: Key, value: EbayCreateFields[Key]) {
    setFields((current) => { const next = { ...current, [key]: value }; onDraftChangeRef.current(next); return next; });
  }

  function updateAspects(next: Record<string, string[]>) {
    setAspectValues(next);
    updateField("aspectsText", JSON.stringify(next, null, 2));
  }

  return (
    <section className="mt-4 space-y-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
      <div><h2 className="text-base font-semibold">eBay seller configuration</h2><p className="text-sm text-muted-foreground">Enter an EAN to load the source product, choose a leaf category, and complete its eBay attributes before publishing.</p></div>
      {loading ? <p className="text-sm text-muted-foreground">Loading seller setup…</p> : null}
      {error ? <p className="text-sm text-destructive">Seller setup load failed: {error}</p> : null}
      {!loading && !error ? <div className="grid gap-3 md:grid-cols-2">
        {account === "JV" ? <label className="space-y-1.5 text-sm font-medium md:col-span-2">Warehouse ({locations.length})<select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.merchantLocationKey} onChange={(event) => updateField("merchantLocationKey", event.target.value)}><option value="">Select merchant location</option>{locations.map((location) => <option key={location.merchantLocationKey} value={location.merchantLocationKey}>{location.merchantLocationKey} — {addressLabel(location)}</option>)}</select></label> : null}
        {account === "JV" && locations.length === 0 ? <p className="text-sm text-amber-700 md:col-span-2">This eBay account has no merchant location. Configure its shipping warehouse before publishing.</p> : null}
        <label className="space-y-1.5 text-sm font-medium md:col-span-2">Fulfillment policy ({fulfillmentPolicies.length})<select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.fulfillmentPolicyId} onChange={(event) => updateField("fulfillmentPolicyId", event.target.value)}><option value="">Select fulfillment policy</option>{fulfillmentPolicies.map((policy) => <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>{fulfillmentLabel(policy)}</option>)}</select></label>
        <label className="space-y-1.5 text-sm font-medium">Payment policy ({paymentPolicies.length})<select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.paymentPolicyId} onChange={(event) => updateField("paymentPolicyId", event.target.value)}><option value="">Select payment policy</option>{paymentPolicies.map((policy) => <option key={policy.paymentPolicyId} value={policy.paymentPolicyId}>{policy.name} — {policy.paymentPolicyId}</option>)}</select></label>
        <label className="space-y-1.5 text-sm font-medium">Return policy ({returnPolicies.length})<select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.returnPolicyId} onChange={(event) => updateField("returnPolicyId", event.target.value)}><option value="">Select return policy</option>{returnPolicies.map((policy) => <option key={policy.returnPolicyId} value={policy.returnPolicyId}>{policy.name} — {policy.returnPeriod?.value} {policy.returnPeriod?.unit}, {policy.returnShippingCostPayer}</option>)}</select></label>
        <div className="space-y-1.5 text-sm font-medium md:col-span-2"><label className="block">EAN / SKU</label><div className="flex gap-2"><DeferredInput className="wh-input h-10 min-w-0 flex-1 rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.ean} onDraftChange={(value) => updateField("ean", value)} onCommit={(value) => updateField("ean", value)} /><button type="button" className="wh-button-secondary shrink-0" disabled={!fields.ean.trim() || sourceLoading} onClick={() => onLoadSource(fields.ean)}>{sourceLoading ? "Loading product…" : "Load source product"}</button></div><p className="text-xs font-normal text-muted-foreground">Loads JV/XL product data and, when indexed, eBay category and item specifics. Review category attributes; merchant location and policies must belong to this account. Loading does not publish.</p></div>
        <label className="space-y-1.5 text-sm font-medium">Price (EUR)<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.price} onCommit={(value) => updateField("price", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">Quantity<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.quantity} onCommit={(value) => updateField("quantity", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium md:col-span-2">Title<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.title} onCommit={(value) => updateField("title", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium md:col-span-2">Subtitle<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.subtitle} onCommit={(value) => updateField("subtitle", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">Product EAN<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.productEan} onCommit={(value) => updateField("productEan", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">Brand<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.brand} onCommit={(value) => updateField("brand", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">Manufacturer part number (MPN)<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.mpn} onCommit={(value) => updateField("mpn", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">eBay product ID (ePID)<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.epid} onCommit={(value) => updateField("epid", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">UPC (one per line)<DeferredTextarea className="min-h-16 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={fields.upc} onCommit={(value) => updateField("upc", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">ISBN (one per line)<DeferredTextarea className="min-h-16 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={fields.isbn} onCommit={(value) => updateField("isbn", value)} /></label>
        <div className="md:col-span-2"><JvDescriptionEditor description={fields.description} previewHtml={fields.description} mode={descriptionMode} descriptionLabel="Description" codeLabel="Code" previewLabel="Preview" onModeChange={setDescriptionMode} onChange={(value) => updateField("description", value)} /></div>
        <label className="space-y-1.5 text-sm font-medium md:col-span-2">Listing description override<DeferredTextarea className="min-h-24 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={fields.listingDescription} onCommit={(value) => updateField("listingDescription", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium">Condition<DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.condition} onCommit={(value) => updateField("condition", value)} placeholder="NEW" /></label>
        <label className="space-y-1.5 text-sm font-medium md:col-span-2">Condition description<DeferredTextarea className="min-h-16 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={fields.conditionDescription} onCommit={(value) => updateField("conditionDescription", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium md:col-span-2">Package weight and size (JSON)<DeferredTextarea className="min-h-24 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 font-mono text-xs" value={fields.packageWeightAndSizeText} onCommit={(value) => updateField("packageWeightAndSizeText", value)} placeholder={'{"weight":{"value":14,"unit":"KILOGRAM"}}'} /></label>
        <EbayCategoryPicker label="Primary category" value={fields.categoryId} excludeCategoryId={fields.secondaryCategoryId} onChange={(categoryId) => updateField("categoryId", categoryId)} />
        <EbayCategoryPicker label="Secondary category" value={fields.secondaryCategoryId} excludeCategoryId={fields.categoryId} optional onChange={(secondaryCategoryId) => updateField("secondaryCategoryId", secondaryCategoryId)} />
        <label className="space-y-1.5 text-sm font-medium">Store category names (one per line)<DeferredTextarea className="min-h-16 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={fields.storeCategoryNamesText} onCommit={(value) => updateField("storeCategoryNamesText", value)} /></label>
        <label className="space-y-1.5 text-sm font-medium md:col-span-2">Regulatory / GPSR (eBay JSON)<DeferredTextarea className="min-h-28 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 font-mono text-xs" value={fields.regulatoryText} onCommit={(value) => updateField("regulatoryText", value)} placeholder="Only enter applicable eBay regulatory fields" /></label>
        <div className="md:col-span-2"><ProductEditorEbaySpecifics title="Category attributes" categoryId={fields.categoryId} value={aspectValues} onChange={updateAspects} /></div>
      </div> : null}
    </section>
  );
}
