"use client";

import { Package, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useLabels } from "../use-labels";
import { MarketplaceInput as Input, MarketplaceSelect, MarketplaceFieldGroup, useMarketplaceField } from "../../components/product-forms/marketplace-form-feedback";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { getOttoShippingProfiles, type OttoShippingProfileAccount } from "../../lib/otto-shipping-profiles";
import { fetchOttoCategoryAttributes, type OttoCategoryAttribute } from "./otto-categories-api";
import { synchronizeOttoDraft, normalizeOttoProductAttributes, ottoAttributeChoices, OTTO_PRODUCT_LINE_MAX_LENGTH } from "./otto-create-product-model.mjs";
import { OttoAiAttributes } from "./otto-ai-attributes";

export type OttoCreateProductDraft = {
  productReference: string;
  sku: string;
  ean: string;
  quantity: string;
  price: string;
  deliveryTime: string;
  shippingProfileId: string;
  category: string;
  productLine: string;
  description: string;
  bulletPoints: string[];
  additionalAttributes: Record<string, string>;
  attributeOverrides: Record<string, string>;
  attributeNames: Record<string, string>;
  removedAttributeIds: string[];
};

export const EMPTY_OTTO_CREATE_PRODUCT_DRAFT: OttoCreateProductDraft = {
  productReference: "", sku: "", ean: "", quantity: "1", price: "", deliveryTime: "", shippingProfileId: "", category: "", productLine: "", description: "",
  bulletPoints: [], additionalAttributes: {}, attributeOverrides: {}, attributeNames: {}, removedAttributeIds: [],
};

type Props = {
  initialDraft: OttoCreateProductDraft;
  draftKey: string;
  showQuantity?: boolean;
  profile: OttoShippingProfileAccount;
  categoryId: string;
  categoryName: string;
  productAttributes: unknown;
  sourceProduct?: Record<string, unknown>;
  onDraftChange: (draft: OttoCreateProductDraft) => void;
};

type OttoProductAttribute = { id: string; label: string; value: string };
const EMPTY_CATEGORY_ATTRIBUTES: OttoCategoryAttribute[] = [];

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{label}</span>{children}</label>;
}

function AttributeInput({ name, value, onChange, placeholder, attribute }: {
  name: string; value: string; onChange: (value: string) => void; placeholder?: string; attribute?: OttoCategoryAttribute;
}) {
  const isBaseColor = name.trim().toLowerCase() === "grundfarbe";
  const choices = ottoAttributeChoices(name, attribute);
  const normalized = isBaseColor ? choices.find((choice) => choice.toLowerCase() === value.trim().toLowerCase()) ?? value : value;
  const isAllowed = choices.includes(normalized);
  useEffect(() => {
    if (isBaseColor && isAllowed && value !== normalized) onChange(normalized);
  }, [isBaseColor, isAllowed, value, normalized, onChange]);
  if (!choices.length) return <Input name={`attributes.${name}`} aria-label={name} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />;
  return <MarketplaceSelect
    name={`attributes.${name}`}
    aria-label={name}
    aria-invalid={Boolean(value) && !isAllowed}
    className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
    value={isAllowed ? normalized : value}
    onChange={(event) => onChange(event.target.value)}
  >
    <option value="">—</option>
    {value && !isAllowed ? <option value={value} disabled>{value} — ✕</option> : null}
    {choices.map((choice) => <option key={choice} value={choice}>{choice}</option>)}
  </MarketplaceSelect>;
}

export function OttoCreateProductPanel({ initialDraft, draftKey, showQuantity = true, profile, categoryId, categoryName, productAttributes, sourceProduct, onDraftChange }: Props) {
  const t = useLabels();
  const [draft, setDraft] = useState<OttoCreateProductDraft>(initialDraft);
  const [loadedAttributes, setLoadedAttributes] = useState<{ key: string; items: OttoCategoryAttribute[] }>({ key: "", items: [] });
  const attributesKey = `${profile}:${categoryId}`;
  const categoryAttributes = loadedAttributes.key === attributesKey ? loadedAttributes.items : EMPTY_CATEGORY_ATTRIBUTES;
  const [attributeError, setAttributeError] = useState<string | null>(null);
  const onDraftChangeRef = useRef(onDraftChange);
  const sourceDraftRef = useRef(initialDraft);
  const dirtyDraftKeyRef = useRef<string | null>(null);
  const loadedDraftKeyRef = useRef(draftKey);
  const initialDraftSignature = JSON.stringify(initialDraft);

  onDraftChangeRef.current = onDraftChange;
  sourceDraftRef.current = initialDraft;
  useEffect(() => {
    setAttributeError(null);
    if (!categoryId) return;
    let active = true;
    setLoadedAttributes({ key: attributesKey, items: [] });
    void fetchOttoCategoryAttributes(categoryId, profile).then((items) => {
      if (active) setLoadedAttributes({ key: attributesKey, items });
    }).catch((error: unknown) => {
      if (active) {
        setLoadedAttributes({ key: attributesKey, items: [] });
        setAttributeError(error instanceof Error ? error.message : "OTTO category attributes could not be loaded.");
      }
    });
    return () => { active = false; };
  }, [categoryId, profile, attributesKey]);
  useEffect(() => {
    if (loadedDraftKeyRef.current !== draftKey) {
      dirtyDraftKeyRef.current = null;
      loadedDraftKeyRef.current = draftKey;
    }
    const current = dirtyDraftKeyRef.current === draftKey ? draft : sourceDraftRef.current;
    const next = synchronizeOttoDraft(current, productAttributes, categoryAttributes, categoryName);
    if (JSON.stringify(next) === JSON.stringify(draft)) return;
    setDraft(next);
    onDraftChangeRef.current(next);
  }, [draft, categoryAttributes, categoryName, productAttributes, draftKey, initialDraftSignature]);

  const update = <Key extends keyof OttoCreateProductDraft>(key: Key, value: OttoCreateProductDraft[Key]) => {
    const next = { ...draft, [key]: value };
    dirtyDraftKeyRef.current = draftKey;
    setDraft(next);
    onDraftChangeRef.current(next);
  };
  const updateBullet = (index: number, value: string) => {
    const next = Array.from({ length: Math.max(5, draft.bulletPoints.length) }, (_, itemIndex) => draft.bulletPoints[itemIndex] ?? "");
    next[index] = value;
    update("bulletPoints", next);
  };
  const bulletPoints = Array.from({ length: 5 }, (_, index) => draft.bulletPoints[index] ?? "");
  const selectedAttributes = normalizeOttoProductAttributes(productAttributes)
    .filter((attribute) => !draft.removedAttributeIds.includes(attribute.id))
    .map((attribute) => ({ ...attribute, value: draft.attributeOverrides[attribute.id] ?? attribute.values.join(", ") }));
  const selectedAttributeNames = new Set(selectedAttributes.map((attribute) => attribute.label.trim().toLocaleLowerCase()));
  const availableCategoryAttributes = categoryAttributes.filter((attribute) =>
    !selectedAttributeNames.has(attribute.name.trim().toLocaleLowerCase()) && !(attribute.id in draft.additionalAttributes),
  );
  const additionalAttributes = categoryAttributes.filter((attribute) => attribute.id in draft.additionalAttributes);
  const shippingProfiles = getOttoShippingProfiles(profile);
  const shippingFeedback = useMarketplaceField("shippingProfileId");
  const selectedShippingProfile = shippingProfiles.find((shippingProfile) => shippingProfile.id === draft.shippingProfileId) ?? null;
  const updateAdditionalAttribute = (attribute: OttoCategoryAttribute, value: string) => {
    const next = {
      ...draft,
      additionalAttributes: { ...draft.additionalAttributes, [attribute.id]: value },
      attributeNames: { ...draft.attributeNames, [attribute.id]: attribute.name },
      removedAttributeIds: draft.removedAttributeIds.filter((id) => id !== attribute.id),
    };
    dirtyDraftKeyRef.current = draftKey;
    setDraft(next);
    onDraftChangeRef.current(next);
  };
  const updateProductAttribute = (attribute: OttoProductAttribute, value: string) => {
    const next = {
      ...draft,
      attributeOverrides: { ...draft.attributeOverrides, [attribute.id]: value },
      attributeNames: { ...draft.attributeNames, [attribute.id]: attribute.label },
    };
    dirtyDraftKeyRef.current = draftKey;
    setDraft(next);
    onDraftChangeRef.current(next);
  };
  const removeProductAttribute = (attributeId: string) => {
    update("removedAttributeIds", [...draft.removedAttributeIds, attributeId]);
  };
  const removeAdditionalAttribute = (attributeId: string) => {
    const { [attributeId]: _removed, ...remaining } = draft.additionalAttributes;
    const next = { ...draft, additionalAttributes: remaining, removedAttributeIds: [...draft.removedAttributeIds, attributeId] };
    dirtyDraftKeyRef.current = draftKey;
    setDraft(next);
    onDraftChangeRef.current(next);
  };

  return (
    <div className="space-y-4">
      {attributeError ? <p role="alert" className="text-sm text-destructive">{attributeError}</p> : null}
      <Field label={t.ottoProductLine}><Input name="productLine" maxLength={OTTO_PRODUCT_LINE_MAX_LENGTH} value={draft.productLine} onChange={(event) => update("productLine", event.target.value)} /></Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t.ottoProductReference}><Input name="productReference" value={draft.productReference} onChange={(event) => update("productReference", event.target.value)} /></Field>
        <Field label="SKU"><Input name="sku" value={draft.sku} onChange={(event) => update("sku", event.target.value)} /></Field>
        <Field label="EAN"><Input name="ean" value={draft.ean} onChange={(event) => update("ean", event.target.value)} /></Field>
      </div>
      {showQuantity ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t.ottoPriceEur}><Input name="price" inputMode="decimal" value={draft.price} onChange={(event) => update("price", event.target.value)} /></Field>
          <Field label={t.quantity}><Input name="quantity" type="number" min="1" step="1" inputMode="numeric" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} /></Field>
        </div>
      ) : <Field label={t.ottoPriceEur}><Input name="price" inputMode="decimal" value={draft.price} onChange={(event) => update("price", event.target.value)} /></Field>}
      <Field label={t.ottoDeliveryTimeDays}><Input name="deliveryTime" inputMode="numeric" value={draft.deliveryTime} onChange={(event) => update("deliveryTime", event.target.value)} /></Field>
      <Field label={t.ottoShippingProfile}>
        <MarketplaceFieldGroup name="shippingProfileId">
        <Select value={draft.shippingProfileId} onValueChange={(value) => { shippingFeedback.clear(); update("shippingProfileId", value ?? ""); }}>
          <SelectTrigger id="otto-shipping-profile" className="w-full"><SelectValue placeholder="Select shipping profile">{selectedShippingProfile?.name ?? null}</SelectValue></SelectTrigger>
          <SelectContent alignItemWithTrigger={false} style={{ width: "var(--anchor-width)" }}>
            <SelectGroup>
              {shippingProfiles.map((shippingProfile) => (
                <SelectItem key={shippingProfile.id} value={shippingProfile.id}>{shippingProfile.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        </MarketplaceFieldGroup>
      </Field>
      <div className="grid gap-3">
        {bulletPoints.map((bulletPoint, index) => (
          <Field key={`bullet-${index}`} label={t.ottoBulletPoint.replace("{index}", String(index + 1))}>
            <Input value={bulletPoint} onChange={(event) => updateBullet(index, event.target.value)} />
          </Field>
        ))}
      </div>
      <MarketplaceFieldGroup name="description"><Field label={t.descriptionLabel}><Textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className="min-h-40" /></Field></MarketplaceFieldGroup>
      {selectedAttributes.length > 0 || draft.category ? (
        <MarketplaceFieldGroup name="attributes"><section className="flex flex-col gap-3" aria-label={t.ottoCategoryAttributes}>
          <OttoAiAttributes key={`${draftKey}:${categoryId}`} categoryId={categoryId} draftKey={draftKey} draft={draft} sourceProduct={sourceProduct} productAttributes={productAttributes} onChange={(next) => {
            dirtyDraftKeyRef.current = draftKey;
            setDraft(next);
            onDraftChangeRef.current(next);
          }} />
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase">{t.attributes}</h3>
            <Select
              value=""
              onValueChange={(attributeId) => {
                const attribute = categoryAttributes.find((item) => item.id === attributeId);
                if (attribute) updateAdditionalAttribute(attribute, "");
              }}
              disabled={!draft.category || availableCategoryAttributes.length === 0}
            >
                <SelectTrigger className="w-56"><SelectValue placeholder={!draft.category ? t.ottoSelectCategoryFirst : availableCategoryAttributes.length ? t.ottoAddAttribute : t.ottoNoAttributes} /></SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {availableCategoryAttributes.map((attribute) => <SelectItem key={attribute.id} value={attribute.id}>{attribute.name}</SelectItem>)}
                  </SelectGroup>
                </SelectContent>
            </Select>
          </div>
          {selectedAttributes.length > 0 ? (
            <dl className="grid gap-3">
            {selectedAttributes.map((attribute) => (
              <div key={attribute.id} className="flex min-w-0 flex-col gap-1">
                <dt className="text-xs font-medium text-muted-foreground">{attribute.label}{categoryAttributes.some((item) => item.relevance === "HIGH" && (item.id === attribute.id || item.name.trim().toLocaleLowerCase() === attribute.label.trim().toLocaleLowerCase())) ? <span className="text-destructive"> *</span> : null}</dt>
                <dd className="flex min-w-0 gap-2">
                  <div className="min-w-0 flex-1"><AttributeInput name={attribute.label} value={attribute.value} attribute={categoryAttributes.find((item) => item.id === attribute.id || item.name === attribute.label)} onChange={(value) => updateProductAttribute(attribute, value)} /></div>
                  <Button type="button" variant="ghost" size="icon" aria-label={t.ottoRemoveAttribute.replace("{name}", attribute.label)} onClick={() => removeProductAttribute(attribute.id)}>
                    <Trash2 />
                  </Button>
                </dd>
              </div>
            ))}
            </dl>
          ) : null}
          {additionalAttributes.length > 0 ? (
            <div className="grid gap-3">
              {additionalAttributes.map((attribute) => (
                <Field key={attribute.id} label={attribute.relevance === "HIGH" ? `${attribute.name} *` : attribute.name}>
                  <div className="flex min-w-0 gap-2">
                    <div className="min-w-0 flex-1"><AttributeInput
                      name={attribute.name}
                      attribute={attribute}
                      value={draft.additionalAttributes[attribute.id] ?? ""}
                      onChange={(value) => updateAdditionalAttribute(attribute, value)}
                      placeholder={attribute.unit || attribute.type}
                    /></div>
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${attribute.name}`} onClick={() => removeAdditionalAttribute(attribute.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                </Field>
              ))}
            </div>
          ) : null}
        </section></MarketplaceFieldGroup>
      ) : null}



    </div>
  );
}
