"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { DeferredInput } from "./deferred-form-fields";

type Property = { name: string; value: string };
type Props = {
  initialValue: string;
  draftKey: string;
  onDraftChange: (value: string) => void;
};

function parseProperties(value: string): Property[] {
  try {
    const parsed: unknown = JSON.parse(value || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item): item is Property => Boolean(item) && typeof item.name === "string" && typeof item.value === "string")
      : [];
  } catch {
    return [];
  }
}

export function HoodProductPropertiesPanel({ initialValue, draftKey, onDraftChange }: Props) {
  const sourceValueRef = useRef(initialValue);
  const callbackRef = useRef(onDraftChange);
  const [properties, setProperties] = useState(() => parseProperties(initialValue));

  useEffect(() => { sourceValueRef.current = initialValue; }, [draftKey, initialValue]);
  useEffect(() => { callbackRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => {
    const next = parseProperties(sourceValueRef.current);
    setProperties(next);
    callbackRef.current(JSON.stringify(next));
  }, [draftKey]);

  const serialized = useMemo(() => JSON.stringify(properties), [properties]);
  useEffect(() => { callbackRef.current(serialized); }, [serialized]);

  const update = (next: Property[]) => setProperties(next);
  return (
    <section className="space-y-3 rounded-[var(--radius-control)] border border-border/70 bg-background p-3">
      <div className="flex items-center justify-between gap-3">
        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Product properties</label>
        <button type="button" onClick={() => update([...properties, { name: "", value: "" }])} className="rounded-[var(--radius-pill)] border border-border/70 bg-background px-3 py-1 text-[11px] font-semibold uppercase transition hover:bg-muted/40">Add property</button>
      </div>
      {properties.length === 0 ? <div className="rounded-[var(--radius-control)] border border-dashed border-border/70 bg-muted/20 px-3 py-4 text-sm text-muted-foreground">No product properties returned by HOOD.</div> : null}
      <div className="grid gap-2">
        {properties.map((property, index) => (
          <div key={index} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2">
            <DeferredInput value={property.name} onDraftChange={(name) => update(properties.map((item, itemIndex) => itemIndex === index ? { ...item, name } : item))} placeholder="Name" />
            <DeferredInput value={property.value} onDraftChange={(value) => update(properties.map((item, itemIndex) => itemIndex === index ? { ...item, value } : item))} placeholder="Value" />
            <button type="button" onClick={() => update(properties.filter((_, itemIndex) => itemIndex !== index))} aria-label="Remove property" className="size-10 rounded-[var(--radius-control)] border border-destructive/30 text-destructive transition hover:bg-destructive/10">×</button>
          </div>
        ))}
      </div>
    </section>
  );
}
