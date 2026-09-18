"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { apiFetch } from "../../lib/api/client";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";
import type { EbayCreateFields } from "./create-product-model";

type EbayAccount = "JV" | "XL" | "DEP";

type EbayLocation = {
  merchantLocationKey?: string;
  location?: { address?: { postalCode?: string; city?: string; stateOrProvince?: string; country?: string } };
};
type EbayFulfillmentPolicy = {
  fulfillmentPolicyId?: string;
  name?: string;
  handlingTime?: { value?: number; unit?: string };
  shippingOptions?: Array<{ optionType?: string; shippingServices?: Array<{ shippingServiceCode?: string; shippingCost?: { value?: string; currency?: string }; freeShipping?: boolean }> }>;
};
type SellerSetup = {
  locations?: { locations?: EbayLocation[] };
  fulfillment_policies?: { fulfillmentPolicies?: EbayFulfillmentPolicy[] };
  payment_policies?: { paymentPolicies?: Array<{ paymentPolicyId?: string; name?: string }> };
  return_policies?: { returnPolicies?: Array<{ returnPolicyId?: string; name?: string; returnPeriod?: { value?: number; unit?: string }; returnShippingCostPayer?: string }> };
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

type Props = {
  account: EbayAccount;
  draftKey: string;
  initialFields: EbayCreateFields;
  onDraftChange: (fields: EbayCreateFields) => void;
};

export function EbaySellerSetupPanel({ account, draftKey, initialFields, onDraftChange }: Props) {
  const [setup, setSetup] = useState<SellerSetup | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [fields, setFields] = useState<EbayCreateFields>(initialFields);
  const onDraftChangeRef = useRef(onDraftChange);

  useEffect(() => {
    onDraftChangeRef.current = onDraftChange;
  }, [onDraftChange]);

  useEffect(() => {
    setFields(initialFields);
  }, [draftKey]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setSetup(null);
    void (async () => {
      try {
        const response = await apiFetch(`/api/v1/ebay/seller/setup/?account=${account.toLowerCase()}&marketplace_id=EBAY_DE`, { method: "GET" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setSetup(await response.json() as SellerSetup);
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
    setFields((current) => {
      const next = { ...current, [key]: value };
      onDraftChangeRef.current(next);
      return next;
    });
  }

  return (
    <section className="mt-4 space-y-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
      <div>
        <h2 className="text-base font-semibold">eBay seller configuration</h2>
        <p className="text-sm text-muted-foreground">Choose the warehouse and policies for eBay {account}, then provide the category and category aspects required by eBay.</p>
      </div>
      {loading ? <p className="text-sm text-muted-foreground">Loading seller setup…</p> : null}
      {error ? <p className="text-sm text-destructive">Seller setup load failed: {error}</p> : null}
      {!loading && !error ? (
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5 text-sm font-medium md:col-span-2">Warehouse ({locations.length})
            <select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.merchantLocationKey} onChange={(event) => updateField("merchantLocationKey", event.target.value)}>
              <option value="">Select merchant location</option>
              {locations.map((location) => <option key={location.merchantLocationKey} value={location.merchantLocationKey}>{location.merchantLocationKey} — {addressLabel(location)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium md:col-span-2">Fulfillment policy ({fulfillmentPolicies.length})
            <select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.fulfillmentPolicyId} onChange={(event) => updateField("fulfillmentPolicyId", event.target.value)}>
              <option value="">Select fulfillment policy</option>
              {fulfillmentPolicies.map((policy) => <option key={policy.fulfillmentPolicyId} value={policy.fulfillmentPolicyId}>{fulfillmentLabel(policy)}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">Payment policy ({paymentPolicies.length})
            <select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.paymentPolicyId} onChange={(event) => updateField("paymentPolicyId", event.target.value)}>
              <option value="">Select payment policy</option>
              {paymentPolicies.map((policy) => <option key={policy.paymentPolicyId} value={policy.paymentPolicyId}>{policy.name} — {policy.paymentPolicyId}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">Return policy ({returnPolicies.length})
            <select className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.returnPolicyId} onChange={(event) => updateField("returnPolicyId", event.target.value)}>
              <option value="">Select return policy</option>
              {returnPolicies.map((policy) => <option key={policy.returnPolicyId} value={policy.returnPolicyId}>{policy.name} — {policy.returnPeriod?.value} {policy.returnPeriod?.unit}, {policy.returnShippingCostPayer}</option>)}
            </select>
          </label>
          <label className="space-y-1.5 text-sm font-medium">Category ID
            <DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.categoryId} onCommit={(value) => updateField("categoryId", value)} placeholder="eBay category ID" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">Condition
            <DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.condition} onCommit={(value) => updateField("condition", value)} placeholder="NEW" />
          </label>
          <label className="space-y-1.5 text-sm font-medium">EAN / SKU
            <DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.ean} onCommit={(value) => updateField("ean", value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">Price (EUR)
            <DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.price} onCommit={(value) => updateField("price", value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium md:col-span-2">Title
            <DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.title} onCommit={(value) => updateField("title", value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium md:col-span-2">Description
            <DeferredTextarea className="min-h-32 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 text-sm" value={fields.description} onCommit={(value) => updateField("description", value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium">Quantity
            <DeferredInput className="wh-input h-10 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 text-sm" value={fields.quantity} onCommit={(value) => updateField("quantity", value)} />
          </label>
          <label className="space-y-1.5 text-sm font-medium md:col-span-2">Category aspects (JSON object)
            <DeferredTextarea className="min-h-32 w-full rounded-[var(--radius-control)] border border-input bg-background px-3 py-2 font-mono text-xs" value={fields.aspectsText} onCommit={(value) => updateField("aspectsText", value)} placeholder={'{\n  "Brand": ["..."],\n  "Type": ["..."]\n}'} />
          </label>
        </div>
      ) : null}
    </section>
  );
}
