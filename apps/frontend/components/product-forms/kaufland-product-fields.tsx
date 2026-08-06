"use client";

import { DeferredInput, DeferredTextarea } from "../../app/create-product/deferred-form-fields";

const REQUIRED_CREATE_FIELDS = [
  { key: "size", label: "Size", inputMode: "text" },
  { key: "color", label: "Color", inputMode: "text" },
  { key: "material", label: "Material", inputMode: "text" },
  { key: "delivery", label: "Delivery (days)", inputMode: "numeric" },
  { key: "height", label: "Height", inputMode: "decimal" },
  { key: "length", label: "Length", inputMode: "decimal" },
  { key: "width", label: "Width", inputMode: "decimal" },
] as const;

type KauflandDisplayField = {
  label: string;
  value: string;
  path: string[];
};

const HIDDEN_FIELD_LABELS = new Set([
  "Manufacturer", "Mpn", "Parts Of Animal Origin", "Abnehmbarer Bezug", "Material Composition",
  "Price", "Location", "Condition", "Amount", "Id Product", "Id Unit", "Note", "Shipping Rate",
  "Shipping Group", "Warehouse", "Date Inserted", "Reference Price", "Date Lastchange", "Seller В· Pseudonym",
]);

function formatFieldLabel(path: string[]): string {
  const displayPath = path[0]?.toLowerCase() === "units" && /^\d+$/.test(path[1] || "") ? path.slice(2) : path;
  return displayPath.map((segment) => segment.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())).join(" В· ");
}

function flattenFields(value: unknown, path: string[] = []): KauflandDisplayField[] {
  if (value === null || value === undefined) return [{ label: formatFieldLabel(path), value: "", path }];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return [{ label: formatFieldLabel(path), value: String(value), path }];
  if (Array.isArray(value)) {
    if (value.length === 0) return [{ label: formatFieldLabel(path), value: "", path }];
    if (value.every((item) => item === null || ["string", "number", "boolean"].includes(typeof item))) {
      return [{ label: formatFieldLabel(path), value: value.map((item) => String(item ?? "")).join("\n"), path }];
    }
    return value.flatMap((item, index) => flattenFields(item, [...path, String(index + 1)]));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return [{ label: formatFieldLabel(path), value: "", path }];
    return entries.flatMap(([key, item]) => flattenFields(item, [...path, key]));
  }
  return [{ label: formatFieldLabel(path), value: String(value), path }];
}

function updateField(product: Record<string, unknown>, path: string[], value: string): Record<string, unknown> {
  const next = structuredClone(product) as Record<string, unknown>;
  let target: Record<string, unknown> | unknown[] = next;
  for (const segment of path.slice(0, -1)) {
    const key = Array.isArray(target) ? Number(segment) - 1 : segment;
    const child = target[key as never];
    if (!child || typeof child !== "object") return product;
    target = child as Record<string, unknown> | unknown[];
  }
  const finalKey = Array.isArray(target) ? Number(path.at(-1)) - 1 : path.at(-1)!;
  const targetRecord = target as Record<string, unknown>;
  const original = targetRecord[String(finalKey)];
  targetRecord[String(finalKey)] = Array.isArray(original)
    ? value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)
    : typeof original === "number" ? Number(value) : typeof original === "boolean" ? value === "true" : value;
  return next;
}

function readTopLevelField(product: Record<string, unknown>, key: string): string {
  const value = product[key];
  if (Array.isArray(value)) return String(value[0] ?? "");
  return value == null ? "" : String(value);
}

function updateTopLevelField(product: Record<string, unknown>, key: string, value: string): Record<string, unknown> {
  return { ...product, [key]: value };
}

export function KauflandProductFields({ product, onProductChange }: {
  product: Record<string, unknown>;
  onProductChange: (product: Record<string, unknown>) => void;
}) {
  const fields = flattenFields(Object.fromEntries(Object.entries(product).filter(
    ([key]) => !["title", "ean", "price", "picture", "picture_urls", "category", "category_detail", "storefront", "product_safety_contact", "short_description", "description", "undefined", "null", ...REQUIRED_CREATE_FIELDS.map((field) => field.key)].includes(key.toLowerCase()),
  )))
    .filter((field) => !HIDDEN_FIELD_LABELS.has(field.label))
    .filter((field) => field.label !== "Delivery Time Min" && field.label !== "Delivery Time Max");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {REQUIRED_CREATE_FIELDS.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {field.label}
          </label>
          <DeferredInput
            type={field.inputMode === "text" ? "text" : "number"}
            inputMode={field.inputMode}
            min={field.inputMode === "numeric" ? "0" : undefined}
            step={field.inputMode === "decimal" ? "0.01" : undefined}
            value={readTopLevelField(product, field.key)}
            onDraftChange={(value) => onProductChange(updateTopLevelField(product, field.key, value))}
          />
        </div>
      ))}
      {fields.length === 0 ? (
        <div className="rounded-[var(--radius-control)] border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-sm text-muted-foreground md:col-span-2">
          No additional Kaufland fields returned.
        </div>
      ) : null}
      {fields.map((field, index) => {
        const isLongValue = field.value.length > 180 || field.value.includes("\n");
        return (
          <div key={`${field.label}-${index}`} className={isLongValue ? "space-y-1.5 md:col-span-2" : "space-y-1.5"}>
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{field.label}</label>
            {isLongValue ? (
              <DeferredTextarea value={field.value} onDraftChange={(value) => onProductChange(updateField(product, field.path, value))} className="min-h-[110px] w-full resize-y rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none" />
            ) : (
              <DeferredInput value={field.value} onDraftChange={(value) => onProductChange(updateField(product, field.path, value))} />
            )}
          </div>
        );
      })}
    </div>
  );
}
