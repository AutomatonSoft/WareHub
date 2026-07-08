"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { cn } from "../../lib/cn";
import { decodeHtmlEntities } from "../hood/hood-search-utils";
import {
  makeHoodDescriptionPreviewEditableDocument,
  readHoodDescriptionPreviewDocumentHtml
} from "./product-editor-hood-description-preview";
import { ProductEditorHoodGalleryCard } from "./product-editor-hood-gallery-card";
import { ProductEditorHoodPropertiesPanel } from "./product-editor-hood-properties-panel";
import { ProductEditorPanelLayout } from "./product-editor-shared-panels";
import { containsTechnicalDescriptionHtml, sanitizeDescriptionPreviewHtml } from "./product-editor-model";
import type { ProductEditorHoodDraft, ProductEditorWarning } from "./product-editor-types";

type ProductEditorHoodPanelProps = {
  draft: ProductEditorHoodDraft;
  initialDraft: ProductEditorHoodDraft;
  loading: boolean;
  warnings: ProductEditorWarning[];
  changedFields: string[];
  applyLoading: boolean;
  imageUploadLoading: boolean;
  onChange: (patch: Partial<ProductEditorHoodDraft>) => void;
  onRemoveImage: (imageUrl: string) => void;
  onReorderImages: (sourceImageUrl: string, targetImageUrl: string) => void;
  onUploadFiles: (files: FileList | null) => void;
  onApplyEditedProducts: () => void;
  eanValue: string;
  isEanValid: boolean;
  searching: boolean;
  onChangeEan: (value: string) => void;
  onSearch: () => void;
};

const HOOD_CATEGORY_OPTIONS = [
  { category_id: "2412", category_name: "Sonstige" },
  { category_id: "22210", category_name: "Sonstiges" },
  { category_id: "29625", category_name: "Nachhaltiges Gärtnern" },
  { category_id: "20802", category_name: "Sonstige" },
  { category_id: "29618", category_name: "Nachhaltige Kosmetik" },
  { category_id: "3921", category_name: "Sammlungen & Pakete" },
  { category_id: "3940", category_name: "Sonstige" },
  { category_id: "4231", category_name: "Sonstige" },
  { category_id: "4722", category_name: "Sonstiges" },
  { category_id: "5305", category_name: "Notebooks" },
  { category_id: "5378", category_name: "PC-Systeme" },
  { category_id: "5209", category_name: "Monitore" },
  { category_id: "5187", category_name: "Computer-Klassiker" },
  { category_id: "29622", category_name: "Refurbished Laptops" },
  { category_id: "5484", category_name: "Sonstige" },
  { category_id: "6489", category_name: "Digitalkameras" },
  { category_id: "22041", category_name: "Digitale Camcorder" },
  { category_id: "22048", category_name: "Sonstige" },
  { category_id: "14389", category_name: "Sonstige" },
  { category_id: "6943", category_name: "Handys, Smartphones ohne Vertrag" }
] as const;

export function ProductEditorHoodPanel(props: ProductEditorHoodPanelProps) {
  const ean = props.draft.ean.trim();
  const canApply = props.changedFields.length > 0 || props.draft.pending_uploads.length > 0;
  const [descriptionMode, setDescriptionMode] = useState<"code" | "preview">("preview");
  const descriptionUsesFullDocumentPreview = useMemo(
    () => requiresFullDocumentPreview(props.draft.description),
    [props.draft.description]
  );
  const descriptionPreviewHtml = useMemo(
    () => normalizeHoodDescriptionHtmlForPreview(props.draft.description, props.draft.account),
    [props.draft.account, props.draft.description]
  );
  const descriptionPreviewSrcDoc = useMemo(
    () => buildHoodDescriptionPreviewDocument(props.draft.description, props.draft.account),
    [props.draft.account, props.draft.description]
  );
  const editableDescriptionPreviewSrcDoc = useMemo(
    () => makeHoodDescriptionPreviewEditableDocument(descriptionPreviewSrcDoc),
    [descriptionPreviewSrcDoc]
  );

  return (
    <ProductEditorPanelLayout
      kicker={ean ? `EAN ${ean}` : "EAN -"}
      title={ean ? `EAN: ${ean}` : "EAN: -"}
      changedCount={0}
      hideHeaderBadges
      headerLead={
        <div className="min-w-0">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <Input
              value={props.eanValue}
              onChange={(event) => props.onChangeEan(event.target.value)}
              placeholder="Enter EAN, SKU or product ID"
              maxLength={100}
              className="h-10 min-w-0 flex-1 rounded-xl border-border bg-background text-sm"
              onKeyDown={(event) => {
                if (event.key === "Enter" && props.isEanValid && !props.searching) {
                  event.preventDefault();
                  props.onSearch();
                }
              }}
            />
            <Button
              type="button"
              variant="outline"
              className="h-10 rounded-xl px-4 text-sm font-semibold"
              disabled={!props.isEanValid || props.searching}
              onClick={props.onSearch}
            >
              {props.searching ? "Searching..." : "Discover"}
            </Button>
          </div>
          {ean ? <p className="mt-2 text-xs text-muted-foreground">Loaded product: {ean}</p> : null}
        </div>
      }
      headerActions={
        <Button
          type="button"
          variant="outline"
          className="h-9 rounded-xl text-xs font-semibold"
          disabled={props.applyLoading || !canApply || !ean}
          onClick={props.onApplyEditedProducts}
        >
          {props.applyLoading ? "Updating..." : "Update Edited Products"}
        </Button>
      }
      topLeft={<HoodMainColumn draft={props.draft} onChange={props.onChange} />}
      topRight={
        <div className="space-y-4">
          <ProductEditorHoodGalleryCard
            images={props.draft.images}
            imageUploadLoading={props.imageUploadLoading}
            onRemoveImage={props.onRemoveImage}
            onReorderImages={props.onReorderImages}
            onUploadFiles={props.onUploadFiles}
          />
          <HoodCategoryPanel draft={props.draft} onChange={props.onChange} />
        </div>
      }
      description={null}
      bottom={
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">description</p>
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setDescriptionMode("code")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  descriptionMode === "code" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Code
              </button>
              <button
                type="button"
                onClick={() => setDescriptionMode("preview")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                  descriptionMode === "preview" ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                )}
              >
                Preview
              </button>
            </div>
          </div>

          {descriptionMode === "code" ? (
            <Textarea
              value={props.draft.description}
              onChange={(event) => props.onChange({ description: event.target.value })}
              className="min-h-[32rem] rounded-xl border-border bg-white font-sans text-sm"
            />
          ) : (
            <div className="max-h-[32rem] overflow-auto rounded-xl border border-border bg-white p-4">
              {props.draft.description.trim() ? descriptionUsesFullDocumentPreview ? (
                <EditableHoodDescriptionPreview
                  srcDoc={editableDescriptionPreviewSrcDoc}
                  onSave={(nextDescription) => props.onChange({ description: nextDescription })}
                />
              ) : (
                <div
                  className="text-sm leading-6 outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(event) => props.onChange({ description: event.currentTarget.innerHTML })}
                  dangerouslySetInnerHTML={{ __html: descriptionPreviewHtml }}
                />
              ) : (
                <div
                  className="text-sm text-muted-foreground outline-none"
                  contentEditable
                  suppressContentEditableWarning
                  onBlur={(event) => props.onChange({ description: event.currentTarget.innerHTML })}
                >
                  No description
                </div>
              )}
            </div>
          )}
        </div>
      }
    />
  );
}

function EditableHoodDescriptionPreview({
  srcDoc,
  onSave
}: {
  srcDoc: string;
  onSave: (nextDescription: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const editingRef = useRef(false);
  const lastSavedHtmlRef = useRef("");
  const [frameSrcDoc, setFrameSrcDoc] = useState(srcDoc);

  useEffect(() => {
    if (editingRef.current) return;
    setFrameSrcDoc(srcDoc);
    lastSavedHtmlRef.current = srcDoc;
  }, [srcDoc]);

  function syncFrameToDraft() {
    const nextDescription = readHoodDescriptionPreviewDocumentHtml(iframeRef.current?.contentDocument?.documentElement ?? null);
    if (!nextDescription || nextDescription === lastSavedHtmlRef.current) return;
    lastSavedHtmlRef.current = nextDescription;
    onSave(nextDescription);
  }

  return (
    <div className="space-y-3">
      <iframe
        ref={iframeRef}
        title="hood-description-preview"
        srcDoc={frameSrcDoc}
        sandbox="allow-same-origin allow-popups allow-forms"
        className="h-[32rem] w-full rounded-lg bg-white"
        onLoad={() => {
          const frameWindow = iframeRef.current?.contentWindow;
          const frameDocument = iframeRef.current?.contentDocument;
          const editableBody = frameDocument?.body;
          if (!frameWindow || !editableBody) return;

          const markEditing = () => {
            editingRef.current = true;
            syncFrameToDraft();
          };
          const stopEditing = () => {
            syncFrameToDraft();
            editingRef.current = false;
          };

          editableBody.oninput = markEditing;
          editableBody.onkeyup = markEditing;
          editableBody.onblur = stopEditing;
          frameWindow.onblur = stopEditing;
        }}
      />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Preview is editable. Manual changes are tracked automatically while you type.</p>
        <Button
          type="button"
          variant="secondary"
          className="h-8 rounded-lg text-xs font-semibold"
          onClick={syncFrameToDraft}
        >
          Save Preview Edits
        </Button>
      </div>
    </div>
  );
}

function HoodMainColumn({ draft, onChange }: { draft: ProductEditorHoodDraft; onChange: (patch: Partial<ProductEditorHoodDraft>) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex h-full flex-col rounded-xl border border-border bg-card p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Product name</p>
        <Input value={draft.title} onChange={(event) => onChange({ title: event.target.value })} className="h-11 rounded-xl border-border bg-white text-sm" />
        <p className="mb-2 mt-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Price</p>
        <Input value={draft.price} onChange={(event) => onChange({ price: event.target.value })} className="h-11 rounded-xl border-border bg-white text-sm" />
      </div>
      <div className="pt-4">
        <ProductEditorHoodPropertiesPanel draft={draft} onChange={onChange} />
      </div>
    </div>
  );
}

function HoodCategoryPanel({
  draft,
  onChange
}: {
  draft: ProductEditorHoodDraft;
  onChange: (patch: Partial<ProductEditorHoodDraft>) => void;
}) {
  const selectedCategory = HOOD_CATEGORY_OPTIONS.find((item) => item.category_id === draft.categoryID);

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Category</p>
          <p className="mt-1 text-xs text-muted-foreground">Fixed HOOD categories. Current product category is selected below.</p>
        </div>
        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
          {selectedCategory ? selectedCategory.category_id : draft.categoryID || "None"}
        </span>
      </div>
      <div className="mt-3 overflow-hidden rounded-xl border border-border bg-white">
        <div className="border-b border-border/70 bg-muted/20 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          HOOD category tree
        </div>
        <div className="max-h-72 overflow-auto">
          {HOOD_CATEGORY_OPTIONS.map((item) => {
            const checked = draft.categoryID === item.category_id;
            return (
              <label
                key={`${item.category_id}-${item.category_name}`}
                className={cn(
                  "flex cursor-pointer items-center gap-3 border-b border-border/70 px-3 py-2.5 text-xs last:border-b-0",
                  checked ? "bg-emerald-50/70 text-emerald-700" : "text-foreground hover:bg-muted/20"
                )}
              >
                <input
                  type="radio"
                  name="hood-category"
                  className="h-4 w-4 shrink-0 accent-emerald-600"
                  checked={checked}
                  onChange={() => onChange({ categoryID: item.category_id })}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{item.category_name}</span>
                  <span className="block text-[11px] text-muted-foreground">{item.category_id}</span>
                </span>
                {checked ? (
                  <span className="inline-flex shrink-0 rounded-full border border-emerald-300 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-emerald-700">
                    Selected
                  </span>
                ) : null}
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function normalizeHoodDescriptionHtmlForPreview(description: string, account: ProductEditorHoodDraft["account"]): string {
  const baseHref = account === "xl" ? "https://www.xlmoebel.de" : "https://www.jvmoebel.de";
  const decoded = decodeHtmlEntities(description || "");
  const sanitized = sanitizeDescriptionPreviewHtml(decoded);
  if (!sanitized) return "";

  return sanitized
    .replace(/%HOST%/gi, baseHref)
    .replace(/src=(['"])\/(?!\/)/gi, `src=$1${baseHref}/`)
    .replace(/href=(['"])\/(?!\/)/gi, `href=$1${baseHref}/`)
    .replace(/src=(['"])cosmoshop\//gi, `src=$1${baseHref}/cosmoshop/`)
    .replace(/href=(['"])cosmoshop\//gi, `href=$1${baseHref}/cosmoshop/`)
    .replace(/src=(['"])image\//gi, `src=$1${baseHref}/image/`)
    .replace(/href=(['"])image\//gi, `href=$1${baseHref}/image/`);
}

function buildHoodDescriptionPreviewDocument(description: string, account: ProductEditorHoodDraft["account"]): string {
  const baseHref = account === "xl" ? "https://www.xlmoebel.de/" : "https://www.jvmoebel.de/";
  const decoded = decodeHtmlEntities(description || "").trim();
  if (!decoded) return "";

  const withBase = injectBaseHref(decoded, baseHref);
  if (/<html[\s>]/i.test(withBase)) return withBase;

  return `<!doctype html><html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><base href="${baseHref}" target="_blank" /></head><body>${withBase}</body></html>`;
}

function injectBaseHref(html: string, baseHref: string): string {
  if (/<base\b/i.test(html)) {
    return html.replace(/<base\b[^>]*>/i, `<base href="${baseHref}" target="_blank" />`);
  }
  if (/<head\b[^>]*>/i.test(html)) {
    return html.replace(/<head\b[^>]*>/i, (match) => `${match}<base href="${baseHref}" target="_blank" />`);
  }
  return html;
}

function requiresFullDocumentPreview(description: string): boolean {
  const decoded = decodeHtmlEntities(description || "");
  return /<html[\s>]/i.test(decoded) || /<head[\s>]/i.test(decoded) || containsTechnicalDescriptionHtml(decoded);
}
