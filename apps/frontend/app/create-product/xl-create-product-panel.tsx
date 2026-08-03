"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLabels } from "../use-labels";
import { Input } from "../../components/ui/input";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";
import { fetchXlManufacturerOptions, type XlManufacturerOption } from "./create-product-source-api";

export type XlCreateProductDraft = { name: string; seo_url: string; ean: string; price: string; uvp: string; manufacturer_id: string; description: string; tag: string; meta_title: string; meta_description: string; meta_keyword: string };
type FieldKey = keyof XlCreateProductDraft;
type Props = { initialFields: XlCreateProductDraft; draftKey: string; codeLabel: string; previewLabel: string; onDraftChange: (draft: XlCreateProductDraft) => void };

const fieldClass = "min-h-[110px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary";
const buildSeoUrl = (value: string) => value.trim().replace(/\s+/g, "+");
const computeUvp = (value: string) => { const price = Number(String(value).replace(",", ".")); return Number.isFinite(price) ? String(Math.round(price * 1.25)) : ""; };

export function XlCreateProductPanel({ initialFields, draftKey, codeLabel, previewLabel, onDraftChange }: Props) {
  const t = useLabels();
  const [draft, setDraft] = useState(initialFields);
  const [descriptionMode, setDescriptionMode] = useState<"code" | "preview">("preview");
  const [manufacturers, setManufacturers] = useState<XlManufacturerOption[]>([]);
  const [manufacturersError, setManufacturersError] = useState("");
  const sourceDraftRef = useRef(initialFields); const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => { sourceDraftRef.current = initialFields; }, [draftKey, initialFields]);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => { setDraft(sourceDraftRef.current); setDescriptionMode("preview"); onDraftChangeRef.current(sourceDraftRef.current); }, [draftKey]);
  useEffect(() => {
    let active = true;
    void fetchXlManufacturerOptions()
      .then((items) => { if (active) { setManufacturers(items); setManufacturersError(""); } })
      .catch(() => { if (active) setManufacturersError(t.failedLoadXlManufacturers); });
    return () => { active = false; };
  }, []);
  const seoUrl = useMemo(() => buildSeoUrl(draft.name) || draft.seo_url, [draft.name, draft.seo_url]);
  const uvp = useMemo(() => computeUvp(draft.price) || draft.uvp, [draft.price, draft.uvp]);
  const selectedManufacturer = manufacturers.find((item) => item.manufacturerId === draft.manufacturer_id) ?? null;
  const update = (key: FieldKey, value: string) => setDraft((current) => { const next = { ...current, [key]: value }; onDraftChange(next); return next; });
  return <div className="space-y-4">
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.name}</label><DeferredInput value={draft.name} onDraftChange={(value) => update("name", value)} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.seo} URL</label><Input value={seoUrl} readOnly /></div>
    <div className="grid gap-4 md:grid-cols-3"><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">EAN</label><DeferredInput value={draft.ean} onDraftChange={(value) => update("ean", value)} /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.price}</label><DeferredInput value={draft.price} onDraftChange={(value) => update("price", value)} /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">UVP</label><Input value={uvp} readOnly /></div></div>
    <div className="grid gap-4 md:grid-cols-2"><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.manufacturer}</label><div className="grid gap-2">{manufacturers.map((item) => <button key={item.manufacturerId} type="button" onClick={() => update("manufacturer_id", item.manufacturerId)} className={["rounded-[var(--radius-control)] border px-3 py-2 text-left text-sm transition", item.manufacturerId === draft.manufacturer_id ? "border-primary bg-primary/10 text-foreground" : "border-border/70 bg-background text-foreground hover:border-primary/60"].join(" ")}><span className="block font-medium">{item.name}</span><span className="block text-xs text-muted-foreground">{item.deliveryTime || t.noDeliveryTime}</span></button>)}</div>{manufacturers.length === 0 && !manufacturersError ? <p className="text-xs text-muted-foreground">{t.loadingXlManufacturers}</p> : null}{manufacturersError ? <p className="text-xs text-destructive">{manufacturersError}</p> : null}</div><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.deliveryLabel}</label><Input value={selectedManufacturer?.deliveryTime || t.selectManufacturer} readOnly /></div></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.tag}</label><DeferredTextarea value={draft.tag} onDraftChange={(value) => update("tag", value)} className={fieldClass.replace("min-h-[110px]", "min-h-[90px]")} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.metaTitleLabel}</label><DeferredInput value={draft.meta_title} onDraftChange={(value) => update("meta_title", value)} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.metaDescriptionLabel}</label><DeferredTextarea value={draft.meta_description} onDraftChange={(value) => update("meta_description", value)} className={fieldClass} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.metaKeywordLabel}</label><DeferredTextarea value={draft.meta_keyword} onDraftChange={(value) => update("meta_keyword", value)} className={fieldClass} /></div>
    <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.descriptionLabel}</label><div className="flex gap-1 rounded-[var(--radius-pill)] border border-border/70 bg-background p-1"><button type="button" onClick={() => setDescriptionMode("code")} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase", descriptionMode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground"].join(" ")}>{codeLabel}</button><button type="button" onClick={() => setDescriptionMode("preview")} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase", descriptionMode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground"].join(" ")}>{previewLabel}</button></div></div>{descriptionMode === "code" ? <DeferredTextarea value={draft.description} onDraftChange={(value) => update("description", value)} className="min-h-[180px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none" /> : <div contentEditable suppressContentEditableWarning onInput={(event) => update("description", event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: draft.description }} className="min-h-[180px] whitespace-pre-wrap rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm leading-6 text-foreground outline-none" />}</div>
  </div>;
}
