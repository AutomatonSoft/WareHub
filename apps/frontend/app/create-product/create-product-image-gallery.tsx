"use client";

import Image from "next/image";
import { useMemo, useRef } from "react";

export type CreateProductGalleryItem = {
  id: string;
  src: string;
  sourcePath?: string;
  file?: File;
  isLocal: boolean;
};

type CreateProductImageGalleryProps = {
  items: CreateProductGalleryItem[];
  activeItemId: string;
  previewAlt: string;
  emptyPreviewLabel: string;
  emptyGalleryLabel: string;
  uploadLabel?: string;
  thumbnailAlt: (index: number) => string;
  deleteAlt?: (index: number) => string;
  onActiveItemChange: (itemId: string) => void;
  onFilesSelected?: (files: FileList | null) => void;
  onDeleteItem?: (itemId: string) => void;
  onMoveItem?: (sourceItemId: string, targetItemId: string) => void;
  onImageError?: (itemId: string) => void;
  className?: string;
};

export function CreateProductImageGallery({
  items,
  activeItemId,
  previewAlt,
  emptyPreviewLabel,
  emptyGalleryLabel,
  uploadLabel,
  thumbnailAlt,
  deleteAlt,
  onActiveItemChange,
  onFilesSelected,
  onDeleteItem,
  onMoveItem,
  onImageError,
  className = "",
}: CreateProductImageGalleryProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeItem = useMemo(
    () => items.find((item) => item.id === activeItemId) ?? items[0] ?? null,
    [activeItemId, items]
  );

  return (
    <div className={["w-full space-y-3 rounded-[var(--radius-control)] border border-border/70 bg-card p-3", className].filter(Boolean).join(" ")}>
      {onFilesSelected ? (
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => {
            onFilesSelected(event.target.files);
            event.target.value = "";
          }}
        />
      ) : null}

      <div className="relative aspect-[4/3] overflow-hidden rounded-[var(--radius-control)] border border-border/70 bg-muted/20">
        {activeItem ? (
          <Image
            src={activeItem.src}
            alt={previewAlt}
            fill
            className="object-cover"
            sizes="(max-width: 1280px) 100vw, 360px"
            unoptimized
            onError={() => onImageError?.(activeItem.id)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {emptyPreviewLabel}
          </div>
        )}
      </div>

      {items.length > 0 ? (
        <div className="grid grid-cols-4 gap-2">
          {items.map((item, index) => {
            const isActive = item.id === activeItem?.id;
            const canMove = Boolean(onMoveItem);
            const canDelete = Boolean(onDeleteItem);

            return (
              <div key={item.id} className="space-y-1">
                <div className="relative">
                  <div
                    onClick={() => onActiveItemChange(item.id)}
                    draggable={canMove}
                    onDragStart={(event) => {
                      if (!onMoveItem) return;
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/gallery-item-id", item.id);
                    }}
                    onDragOver={(event) => {
                      if (onMoveItem) event.preventDefault();
                    }}
                    onDrop={(event) => {
                      if (!onMoveItem) return;
                      event.preventDefault();
                      onMoveItem(event.dataTransfer.getData("text/gallery-item-id"), item.id);
                    }}
                    className={[
                      "relative aspect-square w-full overflow-hidden rounded-[var(--radius-control)] border transition",
                      canMove ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
                      isActive ? "border-primary ring-2 ring-primary/20" : "border-border/70 hover:border-primary/50",
                    ].join(" ")}
                  >
                    <Image
                      src={item.src}
                      alt={thumbnailAlt(index)}
                      fill
                      className="pointer-events-none object-cover"
                      sizes="88px"
                      draggable={false}
                      unoptimized
                      onError={() => onImageError?.(item.id)}
                    />
                  </div>

                  {canDelete ? (
                    <button
                      type="button"
                      onClick={() => onDeleteItem?.(item.id)}
                      className="absolute right-1 top-1 z-10 text-sm font-semibold leading-none text-red-500 transition hover:text-red-600"
                      aria-label={deleteAlt?.(index) ?? "Delete image"}
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-[var(--radius-control)] border border-dashed border-border/70 px-3 py-6 text-center text-sm text-muted-foreground">
          {emptyGalleryLabel}
        </div>
      )}

      {onFilesSelected && uploadLabel ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex min-h-14 w-full items-center justify-center rounded-[var(--radius-control)] border border-dashed border-border/70 bg-background px-4 py-3 text-sm font-medium uppercase tracking-[0.08em] text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
        >
          {uploadLabel}
        </button>
      ) : null}
    </div>
  );
}
