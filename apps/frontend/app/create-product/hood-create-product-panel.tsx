"use client";

import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { useLabels } from "../use-labels";
import { Input } from "../../components/ui/input";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";
import { EditableDescriptionPreview } from "./editable-description-preview";

export type HoodCreateProductDraft = { name: string; ean: string; price: string; description: string; quantity: string; condition: string; itemMode: string; itemNumber: string; productPropertiesText: string };
type Props = {
  initialDraft: HoodCreateProductDraft;
  draftKey: string;
  codeLabel: string;
  previewLabel: string;
  previewDocumentFor: (description: string) => string;
  onDraftChange: (draft: HoodCreateProductDraft) => void;
  publishDraftRef: MutableRefObject<{ draftKey: string; draft: HoodCreateProductDraft } | null>;
};

export function HoodCreateProductPanel({ initialDraft, draftKey, codeLabel, previewLabel, previewDocumentFor, onDraftChange, publishDraftRef }: Props) {
  const t = useLabels();
  const [draft, setDraft] = useState(initialDraft);
  const [mode, setMode] = useState<"code" | "preview">("preview");
  const sourceDraftRef = useRef(initialDraft); const draftRef = useRef(initialDraft); const onDraftChangeRef = useRef(onDraftChange);
  useEffect(() => { sourceDraftRef.current = initialDraft; }, [draftKey, initialDraft]);
  useEffect(() => { onDraftChangeRef.current = onDraftChange; }, [onDraftChange]);
  useEffect(() => {
    const next = sourceDraftRef.current;
    draftRef.current = next;
    publishDraftRef.current = { draftKey, draft: next };
    setDraft(next);
    setMode("preview");
    onDraftChangeRef.current(next);
  }, [draftKey, publishDraftRef]);
  const uvp = useMemo(() => { const value = Number(draft.price.replace(",", ".")); return Number.isFinite(value) ? String(Math.round(value * 1.25)) : ""; }, [draft.price]);
  const update = (key: keyof HoodCreateProductDraft, value: string) => {
    const next = { ...draftRef.current, [key]: value };
    draftRef.current = next;
    publishDraftRef.current = { draftKey, draft: next };
    setDraft(next);
    onDraftChangeRef.current(next);
  };
  return (
    <div className="flex h-full flex-1 flex-col space-y-4">
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.title}</label>
        <DeferredInput value={draft.name} onDraftChange={(value) => update("name", value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-4">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">EAN</label>
          <DeferredInput value={draft.ean} onDraftChange={(value) => update("ean", value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Artikelnr</label>
          <DeferredInput value={draft.itemNumber} onDraftChange={(value) => update("itemNumber", value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.price}</label>
          <DeferredInput value={draft.price} onDraftChange={(value) => update("price", value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">UVP</label>
          <Input value={uvp} readOnly />
        </div>
      </div>
      <div className="flex min-h-[32rem] flex-1 flex-col space-y-1.5">
        <div className="flex items-center justify-between gap-3">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t.descriptionLabel}</label>
          <div className="flex gap-1 rounded-[var(--radius-pill)] border border-border/70 bg-background p-1">
            <button type="button" onClick={() => setMode("code")} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase", mode === "code" ? "bg-primary text-primary-foreground" : "text-muted-foreground"].join(" ")}>{codeLabel}</button>
            <button type="button" onClick={() => setMode("preview")} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase", mode === "preview" ? "bg-primary text-primary-foreground" : "text-muted-foreground"].join(" ")}>{previewLabel}</button>
          </div>
        </div>
        {mode === "code" ? <DeferredTextarea value={draft.description} onDraftChange={(value) => update("description", value)} className="min-h-[30rem] flex-1 w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none" /> : <EditableDescriptionPreview title={t.hoodDescriptionPreview} srcDoc={previewDocumentFor(draft.description)} onSave={(value) => update("description", value)} />}
      </div>
    </div>
  );
}
