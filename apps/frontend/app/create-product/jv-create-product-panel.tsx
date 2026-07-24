"use client";

import { Input } from "../../components/ui/input";
import { memo, useEffect, useState } from "react";
import { DeferredInput, DeferredTextarea } from "./deferred-form-fields";
import { JvDescriptionEditor } from "./jv-description-editor";

type JvFields = {
  name: string;
  urlKey: string;
  artikelnr: string;
  price: string;
  evp: string;
  bezeichnung: string;
  kurzbeschreibung: string;
  shortDescriptionReal: string;
  metaTitle: string;
  metaDescription: string;
  metaKeyword: string;
  description: string;
};
type EditableJvField = Exclude<keyof JvFields, "urlKey" | "evp">;
export type JvCreateProductFields = JvFields;
type Props = {
  fields: JvFields;
  previewHtml: string;
  descriptionMode: "code" | "preview";
  labels: {
    name: string;
    urlKey: string;
    artikelnr: string;
    price: string;
    bezeichnung: string;
    kurzbeschreibung: string;
    shortDescriptionReal: string;
    metaTitle: string;
    metaDescription: string;
    metaKeyword: string;
    description: string;
    keywordPlaceholder: string;
    code: string;
    preview: string;
  };
  onFieldDraftChange: (key: EditableJvField, value: string) => void;
  onDescriptionModeChange: (mode: "code" | "preview") => void;
  buildUrlKey: (value: string) => string;
  computeEvp: (value: string) => string;
};

const textAreaClass = "min-h-[110px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary";

export const JvCreateProductPanel = memo(function JvCreateProductPanel({
  fields,
  previewHtml,
  descriptionMode,
  labels,
  onFieldDraftChange,
  onDescriptionModeChange,
  buildUrlKey,
  computeEvp,
}: Props) {
  const [liveDerivedFields, setLiveDerivedFields] = useState({ name: fields.name, price: fields.price, metaKeyword: fields.metaKeyword });

  useEffect(() => {
    setLiveDerivedFields({ name: fields.name, price: fields.price, metaKeyword: fields.metaKeyword });
  }, [fields.metaKeyword, fields.name, fields.price]);

  const handleDraftChange = (key: EditableJvField, value: string) => {
    onFieldDraftChange(key, value);
    if (key === "name" || key === "price" || key === "metaKeyword") {
      setLiveDerivedFields((current) => ({ ...current, [key]: value }));
    }
  };
  const metaKeywordItems = liveDerivedFields.metaKeyword.split(/[,\n;]/).map((item) => item.trim()).filter(Boolean);
  return (
    <div className="min-w-0 flex-1 space-y-4">
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{labels.name}</label>
        <DeferredInput value={fields.name} onDraftChange={(value) => handleDraftChange("name", value)} />
      </div>
      <div className="space-y-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{labels.urlKey}</label>
        <Input value={buildUrlKey(liveDerivedFields.name)} readOnly />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{labels.artikelnr}</label>
          <DeferredInput value={fields.artikelnr} onDraftChange={(value) => handleDraftChange("artikelnr", value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{labels.price}</label>
          <DeferredInput value={fields.price} onDraftChange={(value) => handleDraftChange("price", value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">UVP</label>
          <Input value={computeEvp(liveDerivedFields.price)} readOnly />
        </div>
      </div>
      <div className="grid gap-4">
        {([
          ["bezeichnung", labels.bezeichnung],
          ["kurzbeschreibung", labels.kurzbeschreibung],
          ["shortDescriptionReal", labels.shortDescriptionReal],
        ] as const).map(([key, label]) => (
          <div key={key} className="space-y-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{label}</label>
            <DeferredTextarea value={fields[key]} onDraftChange={(value) => handleDraftChange(key, value)} className={textAreaClass} />
          </div>
        ))}
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{labels.metaTitle}</label>
          <DeferredInput value={fields.metaTitle} onDraftChange={(value) => handleDraftChange("metaTitle", value)} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{labels.metaDescription}</label>
          <DeferredTextarea value={fields.metaDescription} onDraftChange={(value) => handleDraftChange("metaDescription", value)} className={textAreaClass} />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{labels.metaKeyword}</label>
          <div className="rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-3">
            {metaKeywordItems.length > 0 ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {metaKeywordItems.map((keyword, index) => (
                  <span key={`${keyword}-${index}`} className="rounded-[var(--radius-pill)] border border-border/70 bg-muted/30 px-3 py-1 text-xs text-foreground">{keyword}</span>
                ))}
              </div>
            ) : null}
            <DeferredTextarea value={fields.metaKeyword} onDraftChange={(value) => handleDraftChange("metaKeyword", value)} placeholder={labels.keywordPlaceholder} className="min-h-[110px] w-full border-0 bg-transparent p-0 text-sm text-foreground outline-none" />
          </div>
        </div>
        <JvDescriptionEditor
          description={fields.description}
          previewHtml={previewHtml}
          mode={descriptionMode}
          descriptionLabel={labels.description}
          codeLabel={labels.code}
          previewLabel={labels.preview}
          onModeChange={onDescriptionModeChange}
          onChange={(value) => handleDraftChange("description", value)}
        />
      </div>
    </div>
  );
}, (previous, next) => (
  previous.fields.name === next.fields.name
  && previous.fields.urlKey === next.fields.urlKey
  && previous.fields.artikelnr === next.fields.artikelnr
  && previous.fields.price === next.fields.price
  && previous.fields.evp === next.fields.evp
  && previous.fields.bezeichnung === next.fields.bezeichnung
  && previous.fields.kurzbeschreibung === next.fields.kurzbeschreibung
  && previous.fields.shortDescriptionReal === next.fields.shortDescriptionReal
  && previous.fields.metaTitle === next.fields.metaTitle
  && previous.fields.metaDescription === next.fields.metaDescription
  && previous.fields.metaKeyword === next.fields.metaKeyword
  && previous.fields.description === next.fields.description
  && previous.previewHtml === next.previewHtml
  && previous.descriptionMode === next.descriptionMode
  && previous.labels.name === next.labels.name
  && previous.labels.urlKey === next.labels.urlKey
  && previous.labels.artikelnr === next.labels.artikelnr
  && previous.labels.price === next.labels.price
  && previous.labels.bezeichnung === next.labels.bezeichnung
  && previous.labels.kurzbeschreibung === next.labels.kurzbeschreibung
  && previous.labels.shortDescriptionReal === next.labels.shortDescriptionReal
  && previous.labels.metaTitle === next.labels.metaTitle
  && previous.labels.metaDescription === next.labels.metaDescription
  && previous.labels.metaKeyword === next.labels.metaKeyword
  && previous.labels.description === next.labels.description
  && previous.labels.keywordPlaceholder === next.labels.keywordPlaceholder
  && previous.labels.code === next.labels.code
  && previous.labels.preview === next.labels.preview
));
