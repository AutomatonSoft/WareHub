"use client";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { ProductEditorHoodDraft, ProductEditorHoodProperty } from "./product-editor-types";

type ProductEditorHoodPropertiesPanelProps = {
  draft: ProductEditorHoodDraft;
  onChange: (patch: Partial<ProductEditorHoodDraft>) => void;
};

export function ProductEditorHoodPropertiesPanel(props: ProductEditorHoodPropertiesPanelProps) {
  const properties = props.draft.productProperties;

  function patchProperty(index: number, patch: Partial<ProductEditorHoodProperty>) {
    props.onChange({
      productProperties: properties.map((property, propertyIndex) =>
        propertyIndex === index ? { ...property, ...patch } : property
      )
    });
  }

  function addProperty() {
    props.onChange({
      productProperties: [...properties, { name: "", value: "" }]
    });
  }

  function removeProperty(index: number) {
    props.onChange({
      productProperties: properties.filter((_, propertyIndex) => propertyIndex !== index)
    });
  }

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-[linear-gradient(180deg,rgba(248,250,252,0.96),rgba(255,255,255,1))] p-3 shadow-[0_10px_24px_-22px_rgba(15,23,42,0.35)]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">Product properties</p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-xl border-slate-200 bg-white px-3 text-[11px] font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
          onClick={addProperty}
        >
          Add property
        </Button>
      </div>

      {properties.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-4 text-sm text-slate-500">
          No product properties yet.
        </div>
      ) : (
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {properties.map((property, index) => (
            <div
              key={`hood-property-${index}`}
              className="group rounded-2xl border border-slate-200 bg-white p-2.5 shadow-[0_8px_20px_-20px_rgba(15,23,42,0.45)] transition hover:border-slate-300 hover:shadow-[0_14px_28px_-24px_rgba(15,23,42,0.45)]"
            >
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-400">Property</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="h-7 rounded-lg px-2 text-[10px] font-semibold text-rose-500 hover:bg-rose-50 hover:text-rose-600"
                  onClick={() => removeProperty(index)}
                >
                  Remove
                </Button>
              </div>
              <div className="space-y-2">
                <Input
                  value={property.name}
                  onChange={(event) => patchProperty(index, { name: event.target.value })}
                  className="h-9 rounded-xl border-slate-200 bg-slate-50 px-3 text-xs font-medium text-slate-900 placeholder:text-slate-400"
                  placeholder="Property name"
                />
                <Input
                  value={property.value}
                  onChange={(event) => patchProperty(index, { value: event.target.value })}
                  className="h-9 rounded-xl border-slate-200 bg-white px-3 text-xs text-slate-700 placeholder:text-slate-400"
                  placeholder="Property value"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
