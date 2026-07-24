"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Input } from "../../components/ui/input";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";

export type XlCreateProductDraft = { name: string; seo_url: string; ean: string; price: string; uvp: string; description: string; tag: string; meta_title: string; meta_description: string; meta_keyword: string };
type FieldKey = keyof XlCreateProductDraft;
type Props = { initialFields: XlCreateProductDraft; draftKey: string; codeLabel: string; previewLabel: string; onDraftChange: (draft: XlCreateProductDraft) => void };

const fieldClass = "min-h-[110px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary";
const buildSeoUrl = (value: string) => value.trim().replace(/\s+/g, "+");
const computeUvp = (value: string) => { const price = Number(String(value).replace(",", ".")); return Number.isFinite(price) ? String(Math.round(price * 1.25)) : ""; };

export function XlCreateProductPanel({ initialFields, draftKey, codeLabel, previewLabel, onDraftChange }: Props) {
  const [draft, setDraft] = useState(initialFields);
  const [descriptionMode, setDescriptionMode] = useState<"code" | "preview">("preview");
  const sourceDraftRef = useRef(initialFields); const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => { sourceDraftRef.current = initialFields; }, [draftKey, initialFields]);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => { setDraft(sourceDraftRef.current); setDescriptionMode("preview"); onDraftChangeRef.current(sourceDraftRef.current); }, [draftKey]);
  const seoUrl = useMemo(() => buildSeoUrl(draft.name) || draft.seo_url, [draft.name, draft.seo_url]);
  const uvp = useMemo(() => computeUvp(draft.price) || draft.uvp, [draft.price, draft.uvp]);
  const update = (key: FieldKey, value: string) => setDraft((current) => { const next = { ...current, [key]: value }; onDraftChange(next); return next; });
  return <div className="space-y-4">
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Name</label><DeferredInput value={draft.name} onDraftChange={(value) => update("name", value)} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">SEO URL</label><Input value={seoUrl} readOnly /></div>
    <div className="grid gap-4 md:grid-cols-3"><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">EAN</label><DeferredInput value={draft.ean} onDraftChange={(value) => update("ean", value)} /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Price</label><DeferredInput value={draft.price} onDraftChange={(value) => update("price", value)} /></div><div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">UVP</label><Input value={uvp} readOnly /></div></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Tag</label><DeferredTextarea value={draft.tag} onDraftChange={(value) => update("tag", value)} className={fieldClass.replace("min-h-[110px]", "min-h-[90px]")} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Meta title</label><DeferredInput value={draft.meta_title} onDraftChange={(value) => update("meta_title", value)} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Meta description</label><DeferredTextarea value={draft.meta_description} onDraftChange={(value) => update("meta_description", value)} className={fieldClass} /></div>
    <div className="space-y-1.5"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Meta keyword</label><DeferredTextarea value={draft.meta_keyword} onDraftChange={(value) => update("meta_keyword", value)} className={fieldClass} /></div>
    <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Description</label><div className="flex gap-1 rounded-[var(--radius-pill)] border border-border/70 bg-background p-1"><button type="button" onClick={() => setDescriptionMode("code")} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase", descriptionMode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground"].join(" ")}>{codeLabel}</button><button type="button" onClick={() => setDescriptionMode("preview")} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase", descriptionMode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground"].join(" ")}>{previewLabel}</button></div></div>{descriptionMode === "code" ? <DeferredTextarea value={draft.description} onDraftChange={(value) => update("description", value)} className="min-h-[180px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none" /> : <div contentEditable suppressContentEditableWarning onInput={(event) => update("description", event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: draft.description }} className="min-h-[180px] whitespace-pre-wrap rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm leading-6 text-foreground outline-none" />}</div>
  </div>;
}
