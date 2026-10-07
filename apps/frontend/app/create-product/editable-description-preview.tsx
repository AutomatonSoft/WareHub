"use client";

import { useEffect, useRef, useState } from "react";

import { readHoodDescriptionPreviewDocumentHtml } from "../../components/product-editor/product-editor-hood-description-preview";
import { HtmlFontFamilySelect } from "../../components/ui/html-font-family-select";

type EditableDescriptionPreviewProps = {
  title: string;
  srcDoc: string;
  onSave: (description: string) => void;
  autoHeight?: boolean;
};

export function EditableDescriptionPreview({
  title,
  srcDoc,
  onSave,
  autoHeight = false,
}: EditableDescriptionPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const frameEventsRef = useRef<AbortController | null>(null);
  const editingRef = useRef(false);
  const selectionRangeRef = useRef<Range | null>(null);
  const lastSavedHtmlRef = useRef("");
  const onSaveRef = useRef(onSave);
  const [frameSrcDoc, setFrameSrcDoc] = useState(srcDoc);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  useEffect(() => {
    if (editingRef.current) return;
    setFrameSrcDoc(srcDoc);
    lastSavedHtmlRef.current = srcDoc;
  }, [srcDoc]);

  const saveFrameEdits = () => {
    const nextDescription = readHoodDescriptionPreviewDocumentHtml(iframeRef.current?.contentDocument?.documentElement ?? null);
    if (!nextDescription || nextDescription === lastSavedHtmlRef.current) return;
    lastSavedHtmlRef.current = nextDescription;
    onSaveRef.current(nextDescription);
  };

  const saveSelection = () => {
    const selection = iframeRef.current?.contentWindow?.getSelection();
    const body = iframeRef.current?.contentDocument?.body;
    if (selection?.rangeCount && body?.contains(selection.getRangeAt(0).commonAncestorContainer)) {
      selectionRangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  };

  const applyFontFamily = (fontFamily: string) => {
    const frameDocument = iframeRef.current?.contentDocument;
    const selection = iframeRef.current?.contentWindow?.getSelection();
    if (!frameDocument || !selectionRangeRef.current || !selection) return;
    selection.removeAllRanges();
    selection.addRange(selectionRangeRef.current);
    frameDocument.execCommand("fontName", false, fontFamily);
    saveSelection();
    saveFrameEdits();
    syncFrameHeight();
  };

  const syncFrameHeight = () => {
    if (!autoHeight || !iframeRef.current) return;
    const documentElement = iframeRef.current.contentDocument?.documentElement;
    const body = iframeRef.current.contentDocument?.body;
    iframeRef.current.style.height = "auto";
    const height = Math.max(documentElement?.scrollHeight ?? 0, body?.scrollHeight ?? 0, 512);
    iframeRef.current.style.height = `${height}px`;
  };

  useEffect(() => () => {
    resizeObserverRef.current?.disconnect();
    frameEventsRef.current?.abort();
  }, []);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1 rounded-t-[var(--radius-control)] border border-b-0 border-border/70 bg-muted/20 p-2">
        <HtmlFontFamilySelect onMouseDown={saveSelection} onSelect={applyFontFamily} />
      </div>
      <iframe
      ref={iframeRef}
      title={title}
      srcDoc={frameSrcDoc}
      sandbox="allow-same-origin allow-popups allow-forms"
      scrolling={autoHeight ? "no" : undefined}
      className={autoHeight
        ? "min-h-[32rem] w-full rounded-[var(--radius-control)] border border-border/70 bg-white"
        : "min-h-[32rem] w-full flex-1 rounded-[var(--radius-control)] border border-border/70 bg-white"}
      onLoad={() => {
        const frameWindow = iframeRef.current?.contentWindow;
        const frameBody = iframeRef.current?.contentDocument?.body;
        const documentElement = iframeRef.current?.contentDocument?.documentElement;
        if (!frameWindow || !frameBody) return;

        frameEventsRef.current?.abort();
        const frameEvents = new AbortController();
        frameEventsRef.current = frameEvents;
        selectionRangeRef.current = null;

        syncFrameHeight();
        frameWindow.setTimeout(syncFrameHeight, 0);
        frameBody.querySelectorAll("img").forEach((image) => {
          image.addEventListener("load", syncFrameHeight, { once: true });
        });
        resizeObserverRef.current?.disconnect();
        if (autoHeight && documentElement) {
          resizeObserverRef.current = new ResizeObserver(syncFrameHeight);
          resizeObserverRef.current.observe(documentElement);
          resizeObserverRef.current.observe(frameBody);
        }

        frameBody.setAttribute("contenteditable", "true");
        frameBody.setAttribute("data-hood-preview-editable", "true");
        const markEditing = () => {
          editingRef.current = true;
        };
        const stopEditing = () => {
          saveFrameEdits();
          editingRef.current = false;
        };
        frameBody.addEventListener("input", () => {
          markEditing();
          syncFrameHeight();
        }, { signal: frameEvents.signal });
        frameBody.addEventListener("keyup", () => { markEditing(); saveSelection(); }, { signal: frameEvents.signal });
        frameBody.addEventListener("mouseup", saveSelection, { signal: frameEvents.signal });
        frameBody.addEventListener("blur", stopEditing, { signal: frameEvents.signal });
        frameWindow.addEventListener("blur", stopEditing, { signal: frameEvents.signal });
      }}
      />
    </div>
  );
}
