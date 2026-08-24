"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { useLabels } from "../use-labels";
import { Input } from "../../components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";
import { fetchXlManufacturerOptions, type XlManufacturerOption } from "./create-product-source-api";
import { JvDescriptionEditor } from "./jv-description-editor";

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
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Name</label><DeferredInput value={draft.name} onDraftChange={(value) => update("name", value)} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">SEO URL</label><Input value={seoUrl} readOnly /></div>
    <div className="grid gap-4 md:grid-cols-3"><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">EAN</label><DeferredInput value={draft.ean} onDraftChange={(value) => update("ean", value)} /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Price</label><DeferredInput value={draft.price} onDraftChange={(value) => update("price", value)} /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">UVP</label><Input value={uvp} readOnly /></div></div>
    <div className="space-y-1.5"><label htmlFor="xl-manufacturer" className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Manufacturer</label><Select value={draft.manufacturer_id || undefined} onValueChange={(value) => update("manufacturer_id", value ?? "")} disabled={manufacturers.length === 0}><SelectTrigger id="xl-manufacturer" className="w-full"><SelectValue placeholder="Select a manufacturer">{selectedManufacturer ? `${selectedManufacturer.name} — ${selectedManufacturer.deliveryTime || "No delivery time"}` : null}</SelectValue></SelectTrigger><SelectContent style={{ width: "var(--anchor-width)" }}><SelectGroup>{manufacturers.map((item) => <SelectItem key={item.manufacturerId} value={item.manufacturerId}>{item.name} — {item.deliveryTime || "No delivery time"}</SelectItem>)}</SelectGroup></SelectContent></Select>{manufacturers.length === 0 && !manufacturersError ? <p className="text-xs text-muted-foreground">Loading XL manufacturers…</p> : null}{manufacturersError ? <p className="text-xs text-destructive">{manufacturersError}</p> : null}</div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tag</label><DeferredTextarea value={draft.tag} onDraftChange={(value) => update("tag", value)} className={fieldClass.replace("min-h-[110px]", "min-h-[90px]")} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Meta title</label><DeferredInput value={draft.meta_title} onDraftChange={(value) => update("meta_title", value)} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Meta description</label><DeferredTextarea value={draft.meta_description} onDraftChange={(value) => update("meta_description", value)} className={fieldClass} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Meta keyword</label><DeferredTextarea value={draft.meta_keyword} onDraftChange={(value) => update("meta_keyword", value)} className={fieldClass} /></div>
    <JvDescriptionEditor description={draft.description} previewHtml={draft.description} mode={descriptionMode} descriptionLabel="Description" codeLabel={codeLabel} previewLabel={previewLabel} onModeChange={setDescriptionMode} onChange={(value) => update("description", value)} />
  </div>;
}
