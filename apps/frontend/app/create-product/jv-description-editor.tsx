"use client";

import { memo, useEffect, useState } from "react";

type Props = { description: string; previewHtml: string; mode: "code" | "preview"; descriptionLabel: string; codeLabel: string; previewLabel: string; onModeChange: (mode: "code" | "preview") => void; onChange: (value: string) => void };

export const JvDescriptionEditor = memo(function JvDescriptionEditor({ description, previewHtml, mode, descriptionLabel, codeLabel, previewLabel, onModeChange, onChange }: Props) {
  const [draft, setDraft] = useState(description);
  useEffect(() => setDraft(description), [description]);

  return <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{descriptionLabel}</label><div className="flex gap-1 rounded-[var(--radius-pill)] border border-border/70 bg-background p-1">{(["code", "preview"] as const).map((nextMode) => <button key={nextMode} type="button" onClick={() => onModeChange(nextMode)} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase transition", mode === nextMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"].join(" ")}>{nextMode === "code" ? codeLabel : previewLabel}</button>)}</div></div>{mode === "code" ? <textarea value={draft} onChange={(event) => { setDraft(event.target.value); onChange(event.target.value); }} className="min-h-[160px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition focus:border-primary" /> : <div contentEditable suppressContentEditableWarning onInput={(event) => onChange(event.currentTarget.innerHTML)} dangerouslySetInnerHTML={{ __html: previewHtml }} className="min-h-[160px] rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary" />}</div>;
}, (previous, next) => (
  previous.description === next.description
  && previous.previewHtml === next.previewHtml
  && previous.mode === next.mode
  && previous.descriptionLabel === next.descriptionLabel
  && previous.codeLabel === next.codeLabel
  && previous.previewLabel === next.previewLabel
));
