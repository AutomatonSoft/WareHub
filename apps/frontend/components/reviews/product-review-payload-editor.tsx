"use client";

import { useEffect, useState } from "react";
import { AttributeInput } from "../../app/create-product/otto-create-product-panel";
import { fetchOttoCategories, fetchOttoCategoryAttributes, type OttoCategoryAttribute } from "../../app/create-product/otto-categories-api";
import { normalizeOttoAttributeValues } from "../../app/create-product/otto-create-product-model.mjs";
import { ProductEditorDescriptionEditor } from "../product-editor/product-editor-content-sections";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import type { ReviewDraft } from "./product-review-api";
import type { ReviewLabels } from "./product-review-labels";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function ProductReviewPayloadEditor({ draft, onChange, labels }: {
  draft: ReviewDraft; onChange: (payload: Record<string, unknown>) => void; labels: ReviewLabels;
}) {
  const [attributes, setAttributes] = useState<OttoCategoryAttribute[]>([]);
  const [metadataError, setMetadataError] = useState(false);
  const description = record(draft.payload.productDescription);
  const categoryName = String(description.category ?? "");
  const categoryId = String(description.categoryId ?? "");
  useEffect(() => {
    let active = true;
    setAttributes([]);
    setMetadataError(false);
    if (draft.item.marketplace === "otto" && (categoryId || categoryName)) {
      void (async () => {
        const categories = categoryId ? [] : await fetchOttoCategories({ query: categoryName });
        const id = categoryId || categories.find((category) => category.name.toLowerCase() === categoryName.toLowerCase())?.id;
        if (!id) throw new Error("category_not_found");
        const values = await fetchOttoCategoryAttributes(id, draft.item.account === "xl" ? "xl" : "jv");
        if (active) setAttributes(values);
      })().catch(() => { if (active) setMetadataError(true); });
    }
    return () => { active = false; };
  }, [draft.item.marketplace, draft.item.account, categoryId, categoryName]);

  const locked = new Set(draft.locked_fields.map((field) => field.toLowerCase()));
  function field(value: unknown, name: string, path: string, change: (value: unknown) => void, depth = 0): React.ReactNode {
    if (depth > 12) return <pre className="overflow-auto text-xs">{JSON.stringify(value, null, 2)}</pre>;
    if (Array.isArray(value)) {
      return <fieldset className="min-w-0 space-y-3 rounded-lg border p-3">
        <legend className="px-1 text-sm font-medium">{name}</legend>
        {value.map((item, index) => <div key={index} className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">{field(item, `${name} ${index + 1}`, `${path}[${index}]`, (next) => change(value.map((entry, position) => position === index ? next : entry)), depth + 1)}</div>
          <Button type="button" variant="outline" size="sm" aria-label={`${labels.remove}: ${name} ${index + 1}`} onClick={() => change(value.filter((_, position) => position !== index))}>{labels.remove}</Button>
        </div>)}
        <Button type="button" variant="outline" size="sm" onClick={() => {
          const next = name === "attributes" ? { name: "", values: [""] } : name === "productProperties" ? { name: "", value: "" } : name === "mediaAssets" ? { type: "IMAGE", location: "" } : value.length ? structuredClone(value[0]) : "";
          change([...value, next]);
        }}>{labels.add}</Button>
      </fieldset>;
    }
    if (value && typeof value === "object") {
      const object = record(value);
      const attributeName = String(object.name ?? "");
      const controlledAttribute = draft.item.marketplace === "otto" && ["grundfarbe", "geschlecht", "zielgruppe"].includes(attributeName.toLowerCase()) && Array.isArray(object.values);
      return <div className="min-w-0 space-y-3">{Object.entries(object).map(([key, item]) => <div key={key}>
        {controlledAttribute && key === "values"
          ? <label className="flex flex-col gap-1 text-sm">{attributeName}<AttributeInput name={attributeName} value={(object.values as string[]).join(", ")} allowedValues={attributes.find((attribute) => attribute.name.toLowerCase() === attributeName.toLowerCase())?.allowedValues} onChange={(next) => change({ ...object, values: normalizeOttoAttributeValues(attributeName, next, attributes.find((attribute) => attribute.name.toLowerCase() === attributeName.toLowerCase())?.allowedValues) })} /></label>
          : field(item, key, `${path}.${key}`, (next) => change({ ...object, [key]: next }), depth + 1)}
      </div>)}</div>;
    }
    if (locked.has(name.toLowerCase())) return <label className="flex flex-col gap-1 text-sm">{name}<Input value={String(value ?? "")} readOnly aria-readonly="true" /></label>;
    if (typeof value === "boolean") return <label className="flex items-center gap-2 text-sm"><Checkbox checked={value} onCheckedChange={(next) => change(next === true)} />{name}</label>;
    if (typeof value === "string" && name.toLowerCase().includes("description")) return <ProductEditorDescriptionEditor title={name} value={value} onChange={change} />;
    return <label className="flex flex-col gap-1 text-sm">{name}{typeof value === "string" && (value.length > 160 || value.includes("\n"))
      ? <Textarea rows={4} value={value} onChange={(event) => change(event.target.value)} />
      : <Input type={typeof value === "number" ? "number" : "text"} step="any" value={String(value ?? "")} onChange={(event) => change(typeof value === "number" && event.target.value !== "" ? Number(event.target.value) : event.target.value)} />}</label>;
  }
  return <div className="space-y-4">
    {metadataError ? <p role="alert" className="text-sm text-destructive">{labels.metadataError}</p> : null}
    {field(draft.payload, "", "payload", (next) => onChange(record(next)))}
  </div>;
}
