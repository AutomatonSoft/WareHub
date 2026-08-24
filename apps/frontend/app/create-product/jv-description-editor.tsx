"use client";

import { memo, useEffect, useRef, useState } from "react";

type Props = { description: string; previewHtml: string; mode: "code" | "preview"; descriptionLabel: string; codeLabel: string; previewLabel: string; onModeChange: (mode: "code" | "preview") => void; onChange: (value: string) => void };

export const JvDescriptionEditor = memo(function JvDescriptionEditor({ description, previewHtml, mode, descriptionLabel, codeLabel, previewLabel, onModeChange, onChange }: Props) {
  const [draft, setDraft] = useState(description);
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastEmittedHtmlRef = useRef("");
  const selectionRangeRef = useRef<Range | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => setDraft(description), [description]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || mode !== "preview" || document.activeElement === editor) return;
    if (editor.innerHTML !== previewHtml) editor.innerHTML = previewHtml;
  }, [mode, previewHtml]);

  const emitEditorHtml = () => {
    const nextHtml = editorRef.current?.innerHTML ?? "";
    lastEmittedHtmlRef.current = nextHtml;
    onChangeRef.current(nextHtml);
  };

  const saveSelection = () => {
    const selection = window.getSelection();
    const editor = editorRef.current;
    if (!selection || selection.rangeCount === 0 || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) selectionRangeRef.current = range.cloneRange();
  };

  const applyCommand = (command: string, value?: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (selectionRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }
    document.execCommand(command, false, value);
    saveSelection();
    emitEditorHtml();
  };

  const toolbarButton = (label: string, command: string, value?: string) => (
    <button
      type="button"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => applyCommand(command, value)}
      className="min-h-8 rounded-[var(--radius-control)] border border-border/70 bg-background px-2.5 text-xs font-semibold text-foreground transition hover:bg-muted/50"
    >
      {label}
    </button>
  );

  return <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{descriptionLabel}</label><div className="flex gap-1 rounded-[var(--radius-pill)] border border-border/70 bg-background p-1">{(["code", "preview"] as const).map((nextMode) => <button key={nextMode} type="button" onClick={() => onModeChange(nextMode)} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase transition", mode === nextMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"].join(" ")}>{nextMode === "code" ? codeLabel : previewLabel}</button>)}</div></div>{mode === "code" ? <textarea value={draft} onChange={(event) => { setDraft(event.target.value); onChangeRef.current(event.target.value); }} className="min-h-[160px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition focus:border-primary" /> : <><div className="flex flex-wrap items-center gap-1 rounded-t-[var(--radius-control)] border border-b-0 border-border/70 bg-muted/20 p-2">{toolbarButton("B", "bold")}{toolbarButton("I", "italic")}{toolbarButton("U", "underline")}<select defaultValue="p" onMouseDown={saveSelection} onChange={(event) => { applyCommand("formatBlock", event.target.value); event.target.value = "p"; }} className="min-h-8 rounded-[var(--radius-control)] border border-border/70 bg-background px-2 text-xs"><option value="p">Text</option><option value="h2">H2</option><option value="h3">H3</option><option value="h4">H4</option></select><select defaultValue="3" onMouseDown={saveSelection} onChange={(event) => { applyCommand("fontSize", event.target.value); event.target.value = "3"; }} className="min-h-8 rounded-[var(--radius-control)] border border-border/70 bg-background px-2 text-xs"><option value="2">Small</option><option value="3">Normal</option><option value="4">Large</option><option value="5">XL</option></select>{toolbarButton("• List", "insertUnorderedList")}{toolbarButton("1. List", "insertOrderedList")}{toolbarButton("Left", "justifyLeft")}{toolbarButton("Center", "justifyCenter")}{toolbarButton("Right", "justifyRight")}{toolbarButton("Clear", "removeFormat")}</div><div ref={editorRef} contentEditable suppressContentEditableWarning onInput={() => { saveSelection(); emitEditorHtml(); }} onKeyUp={saveSelection} onMouseUp={saveSelection} onBlur={() => { if (lastEmittedHtmlRef.current !== editorRef.current?.innerHTML) emitEditorHtml(); }} className="min-h-[160px] rounded-b-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary" /></>}</div>;
}, (previous, next) => (
  previous.description === next.description
  && previous.previewHtml === next.previewHtml
  && previous.mode === next.mode
  && previous.descriptionLabel === next.descriptionLabel
  && previous.codeLabel === next.codeLabel
  && previous.previewLabel === next.previewLabel
));
