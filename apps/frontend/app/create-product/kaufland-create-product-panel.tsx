"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useLabels } from "../use-labels";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";
import { EditableDescriptionPreview } from "./editable-description-preview";

export type KauflandCreateProductDraft = {
  title: string;
  ean: string;
  price: string;
  product: Record<string, unknown>;
  shortDescription: string;
  description: string;
};

type Props = {
  initialDraft: KauflandCreateProductDraft;
  draftKey: string;
  codeLabel: string;
  previewLabel: string;
  previewDocumentFor: (description: string) => string;
  renderProductFields: (product: Record<string, unknown>, onProductChange: (product: Record<string, unknown>) => void) => ReactNode;
  deliveryPortalId: string;
  renderDeliveryTimeRange: (product: Record<string, unknown>, onProductChange: (product: Record<string, unknown>) => void) => ReactNode;
  onDraftChange: (draft: KauflandCreateProductDraft) => void;
};

const splitKeywords = (value: string) => value.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);

export function KauflandProductDetailsPanel({ initialDraft, draftKey, codeLabel, previewLabel, previewDocumentFor, renderProductFields, deliveryPortalId, renderDeliveryTimeRange, onDraftChange }: Props) {
  const t = useLabels();
  const [draft, setDraft] = useState(initialDraft);
  const [mode, setMode] = useState<"code" | "preview">("preview");
  const sourceDraftRef = useRef(initialDraft);
  const [deliveryPortalTarget, setDeliveryPortalTarget] = useState<HTMLElement | null>(null);
  useEffect(() => { sourceDraftRef.current = initialDraft; }, [draftKey, initialDraft]);
  useEffect(() => { setDeliveryPortalTarget(document.getElementById(deliveryPortalId)); }, [deliveryPortalId]);
  useEffect(() => {
    const next = sourceDraftRef.current;
    setDraft(next);
    setMode("preview");
  }, [draftKey]);
  const shortItems = useMemo(() => splitKeywords(draft.shortDescription), [draft.shortDescription]);
  const update = useCallback(<TKey extends keyof KauflandCreateProductDraft>(key: TKey, value: KauflandCreateProductDraft[TKey]) => {
    const next = { ...draft, [key]: value };
    setDraft(next);
    onDraftChange(next);
  }, [draft, onDraftChange]);

  return <div className="space-y-4">
    {deliveryPortalTarget ? createPortal(renderDeliveryTimeRange(draft.product, (product) => update("product", product)), deliveryPortalTarget) : null}
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.title}</label><DeferredInput value={draft.title} onDraftChange={(value) => update("title", value)} /></div>
    <div className="grid gap-4 md:grid-cols-2"><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">EAN</label><DeferredInput value={draft.ean} onDraftChange={(value) => update("ean", value)} /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.price}</label><DeferredInput value={draft.price} onDraftChange={(value) => update("price", value)} /></div></div>
    {renderProductFields(draft.product, (product) => update("product", product))}
    <div className="flex flex-col gap-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.kurzbeschreibungLabel}</label><section className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-border/70 bg-background p-3">{shortItems.length ? <div className="flex flex-wrap gap-2">{shortItems.map((item, index) => <span key={`${item}-${index}`} className="rounded-[var(--radius-pill)] border border-border/70 bg-muted/30 px-3 py-1 text-xs">{item}</span>)}</div> : null}<DeferredTextarea value={draft.shortDescription} onDraftChange={(value) => update("shortDescription", value)} placeholder={t.separateValuesWithCommas} className="min-h-[110px] w-full border-0 bg-transparent p-0 text-sm outline-none" /></section></div>
    <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.descriptionLabel}</label><div className="flex gap-1 rounded-[var(--radius-pill)] border border-border/70 bg-background p-1"><button type="button" onClick={() => setMode("code")} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase", mode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground"].join(" ")}>{codeLabel}</button><button type="button" onClick={() => setMode("preview")} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase", mode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground"].join(" ")}>{previewLabel}</button></div></div>{mode === "code" ? <DeferredTextarea value={draft.description} onDraftChange={(value) => update("description", value)} className="min-h-[180px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 font-mono text-sm outline-none" /> : <EditableDescriptionPreview title={t.kauflandDescriptionPreview} srcDoc={previewDocumentFor(draft.description)} onSave={(value) => update("description", value)} autoHeight />}</div>
  </div>;
}
