"use client";

import { Trash2 } from "lucide-react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../ui/select";
import { Textarea } from "../ui/textarea";
import { OTTO_SHIPPING_PROFILES } from "../../lib/otto-shipping-profiles";
import type { ProductEditorOttoDraft, ProductEditorWarning } from "./product-editor-types";

type Props = {
  draft: ProductEditorOttoDraft;
  warnings: ProductEditorWarning[];
  loading: boolean;
  applyLoading: boolean;
  changedFields: string[];
  onChange: (patch: Partial<ProductEditorOttoDraft>) => void;
  onApply: () => void;
};

type OttoAttribute = {
  name: string;
  values: string[];
  additional?: boolean;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{label}</span>
      {children}
    </label>
  );
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function textValue(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function textList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(textValue) : [];
}

function readAttributes(value: unknown): OttoAttribute[] {
  if (!Array.isArray(value)) return [];
  return value.map((attribute) => {
    const item = asRecord(attribute);
    return {
      name: textValue(item.name),
      values: textList(item.values),
      additional: item.additional === true,
    };
  });
}

function priceText(pricing: Record<string, unknown>): string {
  return textValue(asRecord(pricing.standardPrice).amount);
}

function imageUrls(mediaAssets: Array<Record<string, unknown>>): string[] {
  return mediaAssets.map((asset) => textValue(asset.location)).filter(Boolean);
}

function filenameFromUrl(location: string): string {
  return location.split("/").pop() || "image";
}

export function ProductEditorOttoPanel(props: Props) {
  const productDescription = props.draft.productDescription;
  const delivery = props.draft.delivery;
  const productAttributes = readAttributes(productDescription.attributes);
  const bulletPoints = Array.from({ length: 5 }, (_, index) => textList(productDescription.bulletPoints)[index] ?? "");

  const patchDescription = (patch: Record<string, unknown>) => {
    props.onChange({ productDescription: { ...productDescription, ...patch } });
  };

  const updatePrice = (value: string) => {
    const amount = Number(value);
    if (!Number.isFinite(amount)) return;
    props.onChange({
      pricing: {
        ...props.draft.pricing,
        standardPrice: { ...asRecord(props.draft.pricing.standardPrice), amount },
      },
    });
  };

  const updateDeliveryTime = (value: string) => {
    const deliveryTime = Number(value);
    props.onChange({
      delivery: {
        ...delivery,
        type: textValue(delivery.type).trim() || "PARCEL",
        deliveryTime: Number.isFinite(deliveryTime) ? deliveryTime : value,
      },
    });
  };

  const updateBullet = (index: number, value: string) => {
    const nextBulletPoints = [...bulletPoints];
    nextBulletPoints[index] = value;
    patchDescription({ bulletPoints: nextBulletPoints });
  };

  const updateAttribute = (index: number, patch: Partial<OttoAttribute>) => {
    const nextAttributes = productAttributes.map((attribute, attributeIndex) => attributeIndex === index ? { ...attribute, ...patch } : attribute);
    patchDescription({ attributes: nextAttributes });
  };

  const updateImageUrls = (value: string) => {
    const urls = value.split(/\r?\n/).map((url) => url.trim()).filter(Boolean);
    props.onChange({
      mediaAssets: urls.map((location) => ({ type: "IMAGE", location, filename: filenameFromUrl(location) })),
    });
  };

  return (
    <div className="space-y-4 rounded-[var(--radius-control)] border border-border/70 bg-background p-4">
      <Field label="Product line / title">
        <Input value={textValue(productDescription.productLine)} onChange={(event) => patchDescription({ productLine: event.target.value })} />
      </Field>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="productReference"><Input value={props.draft.productReference} onChange={(event) => props.onChange({ productReference: event.target.value })} /></Field>
        <Field label="SKU"><Input value={props.draft.sku} onChange={(event) => props.onChange({ sku: event.target.value })} /></Field>
        <Field label="EAN"><Input value={props.draft.ean} onChange={(event) => props.onChange({ ean: event.target.value })} /></Field>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Price (EUR)"><Input inputMode="decimal" value={priceText(props.draft.pricing)} onChange={(event) => updatePrice(event.target.value)} /></Field>
        <Field label="Delivery type"><Input value={textValue(delivery.type)} placeholder="PARCEL" onChange={(event) => props.onChange({ delivery: { ...delivery, type: event.target.value } })} /></Field>
        <Field label="Delivery time (days)"><Input inputMode="numeric" value={textValue(delivery.deliveryTime)} onChange={(event) => updateDeliveryTime(event.target.value)} /></Field>
      </div>

      <Field label="Shipping profile">
        <Select value={props.draft.shippingProfileId} onValueChange={(shippingProfileId) => props.onChange({ shippingProfileId: shippingProfileId ?? "" })}>
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

      <Field label="Description">
        <Textarea value={textValue(productDescription.description)} onChange={(event) => patchDescription({ description: event.target.value })} className="min-h-40" />
      </Field>

      <Field label="Image URLs (one URL per line)">
        <Textarea
          value={imageUrls(props.draft.mediaAssets).join("\n")}
          onChange={(event) => updateImageUrls(event.target.value)}
          className="min-h-28"
          placeholder="https://example.com/product-image.jpg"
        />
      </Field>

      <section className="flex flex-col gap-3" aria-label="OTTO product attributes">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold uppercase">Attributes</h3>
          <Button type="button" variant="outline" size="sm" onClick={() => patchDescription({ attributes: [...productAttributes, { name: "", values: [""] }] })}>
            Add attribute
          </Button>
        </div>
        {productAttributes.map((attribute, index) => (
          <div key={`${attribute.name}-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
            <Input value={attribute.name} placeholder="Attribute name" onChange={(event) => updateAttribute(index, { name: event.target.value })} />
            <Input value={attribute.values.join(", ")} placeholder="Values, separated by commas" onChange={(event) => updateAttribute(index, { values: event.target.value.split(",").map((item) => item.trim()).filter(Boolean) })} />
            <Button type="button" variant="ghost" size="icon" aria-label={`Remove attribute ${attribute.name || index + 1}`} onClick={() => patchDescription({ attributes: productAttributes.filter((_, attributeIndex) => attributeIndex !== index) })}>
              <Trash2 />
            </Button>
          </div>
        ))}
      </section>

      <details className="rounded-[var(--radius-control)] border border-border/70 p-3">
        <summary className="cursor-pointer text-sm font-medium">Additional OTTO identifiers</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="ISBN"><Input value={props.draft.isbn} onChange={(event) => props.onChange({ isbn: event.target.value })} /></Field>
          <Field label="UPC"><Input value={props.draft.upc} onChange={(event) => props.onChange({ upc: event.target.value })} /></Field>
          <Field label="PZN"><Input value={props.draft.pzn} onChange={(event) => props.onChange({ pzn: event.target.value })} /></Field>
          <Field label="MPN"><Input value={props.draft.mpn} onChange={(event) => props.onChange({ mpn: event.target.value })} /></Field>
          <Field label="MOIN"><Input value={props.draft.moin} onChange={(event) => props.onChange({ moin: event.target.value })} /></Field>
          <Field label="Maximum order quantity"><Input inputMode="numeric" value={props.draft.maxOrderQuantity} onChange={(event) => props.onChange({ maxOrderQuantity: event.target.value })} /></Field>
        </div>
      </details>

      {props.warnings.map((warning) => <p key={warning.code} className="text-sm text-amber-700">{warning.message}</p>)}
      <Button type="button" disabled={props.loading || props.applyLoading || props.changedFields.length === 0} onClick={props.onApply}>
        {props.applyLoading ? "Applying" : "Review and apply OTTO changes"}
      </Button>
    </div>
  );
}
