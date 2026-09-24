"use client";

import { memo, useEffect, useRef, useState } from "react";

type Props = { description: string; previewHtml: string; mode: "code" | "preview"; descriptionLabel: string; codeLabel: string; previewLabel: string; onModeChange: (mode: "code" | "preview") => void; onChange: (value: string) => void };

export const JvDescriptionEditor = memo(function JvDescriptionEditor({ description, previewHtml, mode, descriptionLabel, codeLabel, previewLabel, onModeChange, onChange }: Props) {
  const [draft, setDraft] = useState(description);
  const [frameHtml, setFrameHtml] = useState(previewHtml);
  const editorRef = useRef<HTMLIFrameElement | null>(null);
  const lastEmittedHtmlRef = useRef("");
  const dirtyRef = useRef(false);
  const selectionRangeRef = useRef<Range | null>(null);
  const onChangeRef = useRef(onChange);
  useEffect(() => setDraft(description), [description]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (previewHtml !== lastEmittedHtmlRef.current) setFrameHtml(previewHtml);
  }, [mode, previewHtml]);

  const frameDocument = () => editorRef.current?.contentDocument;
  const editorBody = () => frameDocument()?.body;

  const emitEditorHtml = () => {
    const frame = frameDocument();
    if (!frame?.body) return;
    const nextHtml = /<!doctype\b|<html\b|<head\b|<body\b/i.test(frameHtml)
      ? frame.documentElement.outerHTML
      : `${frame.head.innerHTML}${frame.body.innerHTML}`;
    if (nextHtml === lastEmittedHtmlRef.current) return;
    lastEmittedHtmlRef.current = nextHtml;
    dirtyRef.current = false;
    onChangeRef.current(nextHtml);
  };

  const saveSelection = () => {
    const selection = editorRef.current?.contentWindow?.getSelection();
    const editor = editorBody();
    if (!selection || selection.rangeCount === 0 || !editor) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) selectionRangeRef.current = range.cloneRange();
  };

  const applyCommand = (command: string, value?: string) => {
    const editor = editorBody();
    if (!editor) return;
    editor.focus();
    const selection = editorRef.current?.contentWindow?.getSelection();
    if (selectionRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }
    frameDocument()?.execCommand(command, false, value);
    saveSelection();
    dirtyRef.current = true;
    emitEditorHtml();
  };

  const applyFontSize = (value: string) => {
    const editor = editorBody();
    const fontSize = Number(value);
    if (!editor || !Number.isInteger(fontSize)) return;

    editor.focus();
    const selection = editorRef.current?.contentWindow?.getSelection();
    if (selectionRangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(selectionRangeRef.current);
    }

    const existingLargeFonts = new Set(editor.querySelectorAll('font[size="7"]'));
    frameDocument()?.execCommand("fontSize", false, "7");
    editor.querySelectorAll<HTMLFontElement>('font[size="7"]').forEach((font) => {
      if (existingLargeFonts.has(font)) return;
      const span = frameDocument()!.createElement("span");
      span.style.fontSize = `${fontSize}px`;
      span.replaceChildren(...Array.from(font.childNodes));
      font.replaceWith(span);
    });

    saveSelection();
    dirtyRef.current = true;
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

  return <div className="space-y-1.5"><div className="flex items-center justify-between gap-3"><label className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{descriptionLabel}</label><div className="flex gap-1 rounded-[var(--radius-pill)] border border-border/70 bg-background p-1">{(["code", "preview"] as const).map((nextMode) => <button key={nextMode} type="button" onClick={() => onModeChange(nextMode)} className={["rounded-[var(--radius-pill)] px-3 py-1 text-[11px] font-semibold uppercase transition", mode === nextMode ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"].join(" ")}>{nextMode === "code" ? codeLabel : previewLabel}</button>)}</div></div>{mode === "code" ? <textarea value={draft} onChange={(event) => { setDraft(event.target.value); onChangeRef.current(event.target.value); }} className="min-h-[160px] w-full rounded-[var(--radius-control)] border border-border/70 bg-background px-3 py-2.5 font-mono text-sm text-foreground outline-none transition focus:border-primary" /> : <><div className="flex flex-wrap items-center gap-1 rounded-t-[var(--radius-control)] border border-b-0 border-border/70 bg-muted/20 p-2">{toolbarButton("B", "bold")}{toolbarButton("I", "italic")}{toolbarButton("U", "underline")}<select defaultValue="p" onMouseDown={saveSelection} onChange={(event) => { applyCommand("formatBlock", event.target.value); event.target.value = "p"; }} className="min-h-8 rounded-[var(--radius-control)] border border-border/70 bg-background px-2 text-xs"><option value="p">Text</option><option value="h2">H2</option><option value="h3">H3</option><option value="h4">H4</option></select><select defaultValue="14" title="Font size (px)" aria-label="Font size in pixels" onMouseDown={saveSelection} onChange={(event) => applyFontSize(event.target.value)} className="min-h-8 rounded-[var(--radius-control)] border border-border/70 bg-background px-2 text-xs"><option value="10">10</option><option value="12">12</option><option value="14">14</option><option value="16">16</option><option value="18">18</option><option value="20">20</option><option value="24">24</option><option value="28">28</option><option value="32">32</option><option value="36">36</option><option value="48">48</option><option value="64">64</option></select>{toolbarButton("• List", "insertUnorderedList")}{toolbarButton("1. List", "insertOrderedList")}{toolbarButton("Left", "justifyLeft")}{toolbarButton("Center", "justifyCenter")}{toolbarButton("Right", "justifyRight")}{toolbarButton("Clear", "removeFormat")}</div><iframe ref={editorRef} title={descriptionLabel} srcDoc={frameHtml} sandbox="allow-same-origin" onLoad={() => { const body = editorBody(); if (!body) return; dirtyRef.current = false; selectionRangeRef.current = null; body.contentEditable = "true"; body.oninput = () => { dirtyRef.current = true; saveSelection(); emitEditorHtml(); }; body.onkeyup = saveSelection; body.onmouseup = saveSelection; body.onblur = () => { if (dirtyRef.current) emitEditorHtml(); }; }} className="h-[360px] w-full rounded-b-[var(--radius-control)] border border-border/70 bg-background" /></>}</div>;
}, (previous, next) => (
  previous.description === next.description
  && previous.previewHtml === next.previewHtml
  && previous.mode === next.mode
  && previous.descriptionLabel === next.descriptionLabel
  && previous.codeLabel === next.codeLabel
  && previous.previewLabel === next.previewLabel
));
