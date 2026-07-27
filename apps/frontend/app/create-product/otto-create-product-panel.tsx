"use client";

import { Package } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { Input } from "../../components/ui/input";
import { Textarea } from "../../components/ui/textarea";

export type OttoCreateProductDraft = {
  productReference: string;
  sku: string;
  ean: string;
  category: string;
  productLine: string;
  description: string;
  bulletPoints: string[];
};

export const EMPTY_OTTO_CREATE_PRODUCT_DRAFT: OttoCreateProductDraft = {
  productReference: "", sku: "", ean: "", category: "", productLine: "", description: "",
  bulletPoints: [],
};

type Props = {
  initialDraft: OttoCreateProductDraft;
  draftKey: string;
  onDraftChange: (draft: OttoCreateProductDraft) => void;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground/65">{label}</span>{children}</label>;
}

export function OttoCreateProductPanel({ initialDraft, draftKey, onDraftChange }: Props) {
  const [draft, setDraft] = useState(initialDraft);
  const sourceDraftRef = useRef(initialDraft);
  const onDraftChangeRef = useRef(onDraftChange);

  useEffect(() => { sourceDraftRef.current = initialDraft; }, [draftKey, initialDraft]);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => { setDraft(sourceDraftRef.current); onDraftChangeRef.current(sourceDraftRef.current); }, [draftKey]);

  const update = <Key extends keyof OttoCreateProductDraft>(key: Key, value: OttoCreateProductDraft[Key]) => {
    setDraft((current) => { const next = { ...current, [key]: value }; onDraftChange(next); return next; });
  };
  const updateBullet = (index: number, value: string) => {
    const next = Array.from({ length: Math.max(5, draft.bulletPoints.length) }, (_, itemIndex) => draft.bulletPoints[itemIndex] ?? "");
    next[index] = value;
    update("bulletPoints", next);
  };
  const bulletPoints = Array.from({ length: 5 }, (_, index) => draft.bulletPoints[index] ?? "");

  return (
    <div className="space-y-4">
      <Field label="Product line / title"><Input value={draft.productLine} onChange={(event) => update("productLine", event.target.value)} /></Field>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="productReference"><Input value={draft.productReference} onChange={(event) => update("productReference", event.target.value)} /></Field>
        <Field label="SKU"><Input value={draft.sku} onChange={(event) => update("sku", event.target.value)} /></Field>
        <Field label="EAN"><Input value={draft.ean} onChange={(event) => update("ean", event.target.value)} /></Field>
      </div>
      <div className="grid gap-3">
        {bulletPoints.map((bulletPoint, index) => (
          <Field key={`bullet-${index}`} label={`Bullet point ${index + 1}`}>
            <Input value={bulletPoint} onChange={(event) => updateBullet(index, event.target.value)} />
          </Field>
        ))}
      </div>
      <Field label="Description"><Textarea value={draft.description} onChange={(event) => update("description", event.target.value)} className="min-h-40" /></Field>



    </div>
  );
}
