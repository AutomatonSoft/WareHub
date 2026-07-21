"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { Trash2 } from "lucide-react";

import { cn } from "../../lib/cn";
import { useLabels } from "../../app/use-labels";
import { Button } from "../ui/button";
import { ProductEditorPreviewImage } from "./product-editor-preview-image";

export type ProductEditorGalleryCardItem = {
  id: string;
  src: string;
  uploading?: boolean;
};

export function ProductEditorGalleryCard(props: {
  items: ProductEditorGalleryCardItem[];
  selectedItemId?: string;
  uploadLoading?: boolean;
  uploadButtonLabel?: string;
  emptyPreviewLabel?: string;
  emptyGalleryLabel?: string;
  onSelectItem?: (itemId: string) => void;
  onRemoveItem?: (itemId: string) => void;
  onReorderItems?: (sourceItemId: string, targetItemId: string) => void;
  onUploadFiles?: (files: FileList | null) => void;
}) {
  const t = useLabels();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draggedItemId, setDraggedItemId] = useState("");
  const [internalSelectedItemId, setInternalSelectedItemId] = useState<string>("");

  const selectedItemId = props.selectedItemId ?? internalSelectedItemId;
  const activeItem = useMemo(
    () => props.items.find((item) => item.id === selectedItemId) ?? props.items[0] ?? null,
    [props.items, selectedItemId]
  );
  const activeItemId = activeItem?.id ?? "";

  useEffect(() => {
    if (props.selectedItemId !== undefined) {
      return;
    }
    const nextSelectedItemId =
      props.items.find((item) => item.id === internalSelectedItemId)?.id ??
      props.items[0]?.id ??
      "";
    if (nextSelectedItemId !== internalSelectedItemId) {
      setInternalSelectedItemId(nextSelectedItemId);
    }
  }, [internalSelectedItemId, props.items, props.selectedItemId]);

  function handleSelect(itemId: string) {
    if (props.selectedItemId === undefined) {
      setInternalSelectedItemId(itemId);
    }
    props.onSelectItem?.(itemId);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xl font-semibold text-foreground">{t.productEditorGalleryTitle}</p>
          <p className="text-sm text-muted-foreground">{t.productEditorGallerySubtitle}</p>
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
          {t.productEditorImagesCount.replace("{count}", String(props.items.length))}
        </span>
      </div>

      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border bg-muted/20">
        {activeItem ? (
          <>
            <ProductEditorPreviewImage
              src={activeItem.src}
              className={cn("h-full w-full object-cover", activeItem.uploading ? "grayscale opacity-60" : null)}
            />
            {activeItemId === props.items[0]?.id ? (
              <span className="absolute left-2 top-2 z-10 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-500/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
                {t.productEditorMainBadge}
              </span>
            ) : null}
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {props.emptyPreviewLabel ?? t.productEditorNoImage}
          </div>
        )}
      </div>

      {props.items.length > 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-2">
          {props.items.map((item, index) => (
            <div
              key={item.id}
              className={cn(
                "relative aspect-square overflow-hidden rounded-[var(--radius-control)] border bg-muted/30 transition",
                item.id === activeItemId ? "border-primary ring-2 ring-primary/20" : "border-border/70 hover:border-primary/50",
                draggedItemId === item.id ? "opacity-60" : null
              )}
              draggable={Boolean(props.onReorderItems)}
              onDragStart={(event) => {
                if (!props.onReorderItems) return;
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/product-editor-gallery-item-id", item.id);
                setDraggedItemId(item.id);
              }}
              onDragOver={(event) => {
                if (!props.onReorderItems) return;
                event.preventDefault();
              }}
              onDrop={(event) => {
                if (!props.onReorderItems) return;
                event.preventDefault();
                const sourceItemId = event.dataTransfer.getData("text/product-editor-gallery-item-id") || draggedItemId;
                if (sourceItemId && sourceItemId !== item.id) {
                  props.onReorderItems(sourceItemId, item.id);
                }
                setDraggedItemId("");
              }}
              onDragEnd={() => setDraggedItemId("")}
            >
              <button type="button" className="h-full w-full" onClick={() => handleSelect(item.id)}>
                <ProductEditorPreviewImage
                  src={item.src}
                  className={cn("h-full w-full object-cover", item.uploading ? "grayscale opacity-60" : null)}
                />
              </button>

              {index === 0 ? (
                <span className="absolute left-1 top-1 z-10 inline-flex items-center rounded-full border border-emerald-300 bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-white">
                  {t.productEditorMainBadge}
                </span>
              ) : null}

              {props.onRemoveItem ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    props.onRemoveItem?.(item.id);
                  }}
                  className="absolute right-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full border border-red-200 bg-red-500/90 text-sm font-bold leading-none text-white shadow-sm transition hover:scale-105 hover:bg-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                  aria-label={t.productEditorRemoveImageAria.replace("{index}", String(index + 1))}
                  title={t.productEditorRemoveImageTitle}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 rounded-[var(--radius-control)] border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
          {props.emptyGalleryLabel ?? t.productEditorNoGalleryImages}
        </div>
      )}

      {props.onUploadFiles ? (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            disabled={props.uploadLoading}
            onChange={(event) => {
              props.onUploadFiles?.(event.target.files);
              event.currentTarget.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            className="mt-3 h-11 w-full rounded-xl text-sm font-semibold"
            disabled={props.uploadLoading}
            onClick={() => fileInputRef.current?.click()}
          >
            {props.uploadButtonLabel ?? t.productEditorUploadImagesAction}
          </Button>
        </>
      ) : null}
    </div>
  );
}
