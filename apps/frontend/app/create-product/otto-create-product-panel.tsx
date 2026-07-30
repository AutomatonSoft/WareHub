"use client";

import { Package, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Textarea } from "../../components/ui/textarea";
import { OTTO_SHIPPING_PROFILES } from "../../lib/otto-shipping-profiles";
import { fetchOttoCategoryAttributes, type OttoCategoryAttribute } from "./otto-categories-api";

export type OttoCreateProductDraft = {
  productReference: string;
  sku: string;
  ean: string;
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
  productReference: "", sku: "", ean: "", price: "", deliveryTime: "", shippingProfileId: "", category: "", productLine: "", description: "",
  bulletPoints: [], additionalAttributes: {}, attributeOverrides: {}, attributeNames: {}, removedAttributeIds: [],
};

type Props = {
  initialDraft: OttoCreateProductDraft;
  draftKey: string;
  categoryId: string;
  categoryName: string;
  productAttributes: unknown;
  onDraftChange: (draft: OttoCreateProductDraft) => void;
};

type OttoProductAttribute = { id: string; label: string; value: string };

function attributeValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(attributeValue).filter(Boolean).join(", ");
  if (value && typeof value === "object") {
    const item = value as Record<string, unknown>;
    return attributeValue(item.value ?? item.name ?? item.label ?? item.displayValue ?? item.id);
  }
  return value === null || value === undefined ? "" : String(value).trim();
}

function normalizeProductAttributes(value: unknown): OttoProductAttribute[] {
  if (Array.isArray(value)) {
    return value.map((attribute, index) => {
      if (!attribute || typeof attribute !== "object") return null;
      const item = attribute as Record<string, unknown>;
      const id = attributeValue(item.attributeId ?? item.attributeKey ?? item.id) || String(index);
      const label = attributeValue(item.name ?? item.label ?? item.attributeKey ?? item.attributeId) || id;
      const selectedValue = attributeValue(item.value ?? item.values ?? item.selectedValues ?? item.attributeValue);
      return selectedValue ? { id, label, value: selectedValue } : null;
    }).filter((attribute): attribute is OttoProductAttribute => Boolean(attribute));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value as Record<string, unknown>)
    .map(([id, selectedValue]) => ({ id, label: id, value: attributeValue(selectedValue) }))
    .filter((attribute) => Boolean(attribute.value));
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{label}</span>{children}</label>;
}

export function OttoCreateProductPanel({ initialDraft, draftKey, categoryId, categoryName, productAttributes, onDraftChange }: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const [categoryAttributes, setCategoryAttributes] = useState<OttoCategoryAttribute[]>([]);
  const sourceDraftRef = useRef(initialDraft);
  const onDraftChangeRef = useRef(onDraftChange);

  useEffect(() => { sourceDraftRef.current = initialDraft; }, [draftKey, initialDraft]);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => { setDraft(sourceDraftRef.current); onDraftChangeRef.current(sourceDraftRef.current); }, [draftKey]);
  useEffect(() => {
    setDraft((current) => {
      if (!categoryName || current.category === categoryName) return current;
      const next = { ...current, category: categoryName };
      onDraftChangeRef.current(next);
      return next;
    });
  }, [categoryName]);
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
      normalizeProductAttributes(productAttributes).map((attribute) => [attribute.id, attribute.label]),
    );
    if (Object.keys(attributeNames).length === 0) return;
    setDraft((current) => {
      const missingNames = Object.fromEntries(
        Object.entries(attributeNames).filter(([attributeId, name]) => current.attributeNames[attributeId] !== name),
      );
      if (Object.keys(missingNames).length === 0) return current;
      const next = { ...current, attributeNames: { ...current.attributeNames, ...missingNames } };
      onDraftChangeRef.current(next);
      return next;
    });
  }, [productAttributes]);

  const update = <Key extends keyof OttoCreateProductDraft>(key: Key, value: OttoCreateProductDraft[Key]) => {
    setDraft((current) => { const next = { ...current, [key]: value }; onDraftChange(next); return next; });
  };
  const updateBullet = (index: number, value: string) => {
    const next = Array.from({ length: Math.max(5, draft.bulletPoints.length) }, (_, itemIndex) => draft.bulletPoints[itemIndex] ?? "");
    next[index] = value;
    update("bulletPoints", next);
  };
  const bulletPoints = Array.from({ length: 5 }, (_, index) => draft.bulletPoints[index] ?? "");
  const selectedAttributes = normalizeProductAttributes(productAttributes)
    .filter((attribute) => !draft.removedAttributeIds.includes(attribute.id))
    .map((attribute) => ({ ...attribute, value: draft.attributeOverrides[attribute.id] ?? attribute.value }));
  const selectedAttributeNames = new Set(selectedAttributes.map((attribute) => attribute.label.trim().toLocaleLowerCase()));
  const availableCategoryAttributes = categoryAttributes.filter((attribute) =>
    !selectedAttributeNames.has(attribute.name.trim().toLocaleLowerCase()) && !(attribute.id in draft.additionalAttributes),
  );
  const additionalAttributes = categoryAttributes.filter((attribute) => attribute.id in draft.additionalAttributes);
  const updateAdditionalAttribute = (attribute: OttoCategoryAttribute, value: string) => {
    setDraft((current) => {
      const next = {
        ...current,
        additionalAttributes: { ...current.additionalAttributes, [attribute.id]: value },
        attributeNames: { ...current.attributeNames, [attribute.id]: attribute.name },
      };
      onDraftChange(next);
      return next;
    });
  };
  const updateProductAttribute = (attribute: OttoProductAttribute, value: string) => {
    setDraft((current) => {
      const next = {
        ...current,
        attributeOverrides: { ...current.attributeOverrides, [attribute.id]: value },
        attributeNames: { ...current.attributeNames, [attribute.id]: attribute.label },
      };
      onDraftChange(next);
      return next;
    });
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
      <Field label="Product line / title"><Input value={draft.productLine} onChange={(event) => update("productLine", event.target.value)} /></Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="productReference"><Input value={draft.productReference} onChange={(event) => update("productReference", event.target.value)} /></Field>
        <Field label="SKU"><Input value={draft.sku} onChange={(event) => update("sku", event.target.value)} /></Field>
        <Field label="EAN"><Input value={draft.ean} onChange={(event) => update("ean", event.target.value)} /></Field>
      </div>
      <Field label="Price (EUR)"><Input inputMode="decimal" value={draft.price} onChange={(event) => update("price", event.target.value)} /></Field>
      <Field label="Delivery time (days)"><Input inputMode="numeric" value={draft.deliveryTime} onChange={(event) => update("deliveryTime", event.target.value)} /></Field>
      <Field label="Shipping profile">
        <Select value={draft.shippingProfileId} onValueChange={(value) => update("shippingProfileId", value ?? "")}>
          <SelectTrigger><SelectValue placeholder="Select shipping profile" /></SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {OTTO_SHIPPING_PROFILES.map((profile) => (
                <SelectItem key={profile.id} value={profile.id}>{profile.name}</SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </Field>
      <div className="grid gap-3">
        {bulletPoints.map((bulletPoint, index) => (
          <Field key={`bullet-${index}`} label={`Bullet point ${index + 1}`}>
            <Input value={bulletPoint} onChange={(event) => updateBullet(index, event.target.value)} />
          </Field>
        ))}
      </div>
      <Field label="Description"><Textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className="min-h-40" /></Field>
      {selectedAttributes.length > 0 || draft.category ? (
        <section className="flex flex-col gap-3" aria-label="OTTO category attributes">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase">Attributes</h3>
            <Select
              value=""
              onValueChange={(attributeId) => {
                const attribute = categoryAttributes.find((item) => item.id === attributeId);
                if (attribute) updateAdditionalAttribute(attribute, "");
              }}
              disabled={!draft.category || availableCategoryAttributes.length === 0}
            >
                <SelectTrigger className="w-56"><SelectValue placeholder={!draft.category ? "Select category first" : availableCategoryAttributes.length ? "Add attribute" : "No attributes"} /></SelectTrigger>
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
                  <Button type="button" variant="ghost" size="icon" aria-label={`Remove ${attribute.label}`} onClick={() => removeProductAttribute(attribute.id)}>
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
