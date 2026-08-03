"use client";

import { useEffect, useRef, useState } from "react";

import { readHoodDescriptionPreviewDocumentHtml } from "../../components/product-editor/product-editor-hood-description-preview";

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
  const editingRef = useRef(false);
  const lastSavedHtmlRef = useRef("");
  const [frameSrcDoc, setFrameSrcDoc] = useState(srcDoc);

  useEffect(() => {
    if (editingRef.current) return;
    setFrameSrcDoc(srcDoc);
    lastSavedHtmlRef.current = srcDoc;
  }, [srcDoc]);

  const saveFrameEdits = () => {
    const nextDescription = readHoodDescriptionPreviewDocumentHtml(iframeRef.current?.contentDocument?.documentElement ?? null);
    if (!nextDescription || nextDescription === lastSavedHtmlRef.current) return;
    lastSavedHtmlRef.current = nextDescription;
    onSave(nextDescription);
  };

  const syncFrameHeight = () => {
    if (!autoHeight || !iframeRef.current) return;
    const documentElement = iframeRef.current.contentDocument?.documentElement;
    const body = iframeRef.current.contentDocument?.body;
    iframeRef.current.style.height = "auto";
    const height = Math.max(documentElement?.scrollHeight ?? 0, body?.scrollHeight ?? 0, 512);
    iframeRef.current.style.height = `${height}px`;
  };

  useEffect(() => () => resizeObserverRef.current?.disconnect(), []);

  return (
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

        frameBody.contentEditable = "true";
        frameBody.dataset.hoodPreviewEditable = "true";
        const markEditing = () => {
          editingRef.current = true;
        };
        const stopEditing = () => {
          saveFrameEdits();
          editingRef.current = false;
        };
        frameBody.oninput = () => {
          markEditing();
          syncFrameHeight();
        };
        frameBody.onkeyup = markEditing;
        frameBody.onblur = stopEditing;
        frameWindow.onblur = stopEditing;
      }}
    />
  );
}
