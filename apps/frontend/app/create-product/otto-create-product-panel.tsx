"use client";

import { Package, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { useLabels } from "../use-labels";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { getOttoShippingProfiles, type OttoShippingProfileAccount } from "../../lib/otto-shipping-profiles";
import { fetchOttoCategoryAttributes, type OttoCategoryAttribute } from "./otto-categories-api";
import { normalizeOttoProductAttributes, OTTO_PRODUCT_LINE_MAX_LENGTH } from "./otto-create-product-model.mjs";

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
  onDraftChange: (draft: OttoCreateProductDraft) => void;
};

type OttoProductAttribute = { id: string; label: string; value: string };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{label}</span>{children}</label>;
}

export function OttoCreateProductPanel({ initialDraft, draftKey, showQuantity = true, profile, categoryId, categoryName, productAttributes, onDraftChange }: Props) {
  const t = useLabels();
  const [draft, setDraft] = useState<OttoCreateProductDraft>(initialDraft);
  const [categoryAttributes, setCategoryAttributes] = useState<OttoCategoryAttribute[]>([]);
  const onDraftChangeRef = useRef(onDraftChange);
  const sourceDraftRef = useRef(initialDraft);
  const dirtyDraftKeyRef = useRef<string | null>(null);
  const initialDraftSignature = JSON.stringify(initialDraft);

  onDraftChangeRef.current = onDraftChange;
  sourceDraftRef.current = initialDraft;
  useEffect(() => {
    dirtyDraftKeyRef.current = null;
    setDraft(sourceDraftRef.current);
  }, [draftKey]);
  useEffect(() => {
    if (dirtyDraftKeyRef.current === draftKey) return;
    setDraft(sourceDraftRef.current);
  }, [draftKey, initialDraftSignature]);
  useEffect(() => {
    if (!categoryName || draft.category === categoryName) return;
    const next = { ...draft, category: categoryName };
    setDraft(next);
    onDraftChangeRef.current(next);
  }, [categoryName, draft]);
  useEffect(() => {
    if (!categoryId) { setCategoryAttributes([]); return; }
    let active = true;
    void fetchOttoCategoryAttributes(categoryId).then((items) => {
      if (active) setCategoryAttributes(items);
    }).catch(() => {
      if (active) setCategoryAttributes([]);
    });
    return () => { active = false; };
  }, [categoryId]);
  useEffect(() => {
    const attributeNames = Object.fromEntries(
      normalizeOttoProductAttributes(productAttributes).map((attribute) => [attribute.id, attribute.label]),
    );
    if (Object.keys(attributeNames).length === 0) return;
    const missingNames = Object.fromEntries(
      Object.entries(attributeNames).filter(([attributeId, name]) => draft.attributeNames[attributeId] !== name),
    );
    if (Object.keys(missingNames).length === 0) return;
    const next = { ...draft, attributeNames: { ...draft.attributeNames, ...missingNames } };
    setDraft(next);
    onDraftChangeRef.current(next);
  }, [draft, productAttributes]);

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
  const selectedShippingProfile = shippingProfiles.find((shippingProfile) => shippingProfile.id === draft.shippingProfileId) ?? null;
  const updateAdditionalAttribute = (attribute: OttoCategoryAttribute, value: string) => {
    const next = {
      ...draft,
      additionalAttributes: { ...draft.additionalAttributes, [attribute.id]: value },
      attributeNames: { ...draft.attributeNames, [attribute.id]: attribute.name },
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
    update("additionalAttributes", remaining);
  };

  return (
    <div className="space-y-4">
      <Field label={t.ottoProductLine}><Input maxLength={OTTO_PRODUCT_LINE_MAX_LENGTH} value={draft.productLine} onChange={(event) => update("productLine", event.target.value)} /></Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label={t.ottoProductReference}><Input value={draft.productReference} onChange={(event) => update("productReference", event.target.value)} /></Field>
        <Field label="SKU"><Input value={draft.sku} onChange={(event) => update("sku", event.target.value)} /></Field>
        <Field label="EAN"><Input value={draft.ean} onChange={(event) => update("ean", event.target.value)} /></Field>
      </div>
      {showQuantity ? (
        <div className="grid gap-3 md:grid-cols-2">
          <Field label={t.ottoPriceEur}><Input inputMode="decimal" value={draft.price} onChange={(event) => update("price", event.target.value)} /></Field>
          <Field label={t.quantity}><Input type="number" min="1" step="1" inputMode="numeric" value={draft.quantity} onChange={(event) => update("quantity", event.target.value)} /></Field>
        </div>
      ) : <Field label={t.ottoPriceEur}><Input inputMode="decimal" value={draft.price} onChange={(event) => update("price", event.target.value)} /></Field>}
      <Field label={t.ottoDeliveryTimeDays}><Input inputMode="numeric" value={draft.deliveryTime} onChange={(event) => update("deliveryTime", event.target.value)} /></Field>
      <Field label={t.ottoShippingProfile}>
        <Select value={draft.shippingProfileId} onValueChange={(value) => update("shippingProfileId", value ?? "")}>
          <SelectTrigger id="otto-shipping-profile" className="w-full"><SelectValue placeholder="Select shipping profile">{selectedShippingProfile?.name ?? null}</SelectValue></SelectTrigger>
          <SelectContent alignItemWithTrigger={false} style={{ width: "var(--anchor-width)" }}>
            <SelectGroup>
              {shippingProfiles.map((shippingProfile) => (
                <SelectItem key={shippingProfile.id} value={shippingProfile.id}>{shippingProfile.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-3">
        {bulletPoints.map((bulletPoint, index) => (
          <Field key={`bullet-${index}`} label={t.ottoBulletPoint.replace("{index}", String(index + 1))}>
            <Input value={bulletPoint} onChange={(event) => updateBullet(index, event.target.value)} />
          </Field>
        ))}
      </div>
      <Field label={t.descriptionLabel}><Textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className="min-h-40" /></Field>
      {selectedAttributes.length > 0 || draft.category ? (
        <section className="flex flex-col gap-3" aria-label={t.ottoCategoryAttributes}>
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
                <dt className="text-xs font-medium text-muted-foreground">{attribute.label}</dt>
                <dd className="flex min-w-0 gap-2">
                  <Input value={attribute.value} onChange={(event) => updateProductAttribute(attribute, event.target.value)} />
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
                <Field key={attribute.id} label={attribute.name}>
                  <div className="flex min-w-0 gap-2">
                    <Input
                      value={draft.additionalAttributes[attribute.id] ?? ""}
                      onChange={(event) => updateAdditionalAttribute(attribute, event.target.value)}
                      placeholder={attribute.unit || attribute.type}
                    />
                    <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${attribute.name}`} onClick={() => removeAdditionalAttribute(attribute.id)}>
                      <Trash2 />
                    </Button>
                  </div>
                </Field>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}



    </div>
  );
}
