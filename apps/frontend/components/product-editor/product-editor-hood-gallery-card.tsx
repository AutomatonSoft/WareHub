"use client";

import { useEffect, useRef, useState } from "react";

import { Trash2 } from "lucide-react";

import { cn } from "../../lib/cn";
import { Button } from "../ui/button";
import { ProductEditorPreviewImage } from "./product-editor-preview-image";

export function ProductEditorHoodGalleryCard({
  images,
  imageUploadLoading,
  onRemoveImage,
  onReorderImages,
  onUploadMainFiles,
  onUploadAdditionalFiles
}: {
  images: string[];
  imageUploadLoading: boolean;
  onRemoveImage: (imageUrl: string) => void;
  onReorderImages: (sourceImageUrl: string, targetImageUrl: string) => void;
  onUploadMainFiles: (files: FileList | null) => void;
  onUploadAdditionalFiles: (files: FileList | null) => void;
}) {
  const mainImageInputRef = useRef<HTMLInputElement | null>(null);
  const additionalImagesInputRef = useRef<HTMLInputElement | null>(null);
  const [draggedImageUrl, setDraggedImageUrl] = useState("");
  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const uniqueImageUrls = Array.from(new Set(images.filter((value) => value.trim() !== "")));
  const mainImageUrl = uniqueImageUrls[0] ?? "";
  const previewImageUrl = uniqueImageUrls.includes(selectedImageUrl) ? selectedImageUrl : mainImageUrl;

  useEffect(() => {
    if (!uniqueImageUrls.length) {
      setSelectedImageUrl("");
      return;
    }
    if (!selectedImageUrl || !uniqueImageUrls.includes(selectedImageUrl)) {
      setSelectedImageUrl(mainImageUrl);
    }
  }, [mainImageUrl, selectedImageUrl, uniqueImageUrls]);

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-xl font-semibold text-foreground">Product Gallery</p>
          <p className="text-sm text-muted-foreground">
            Manage product images, delete old images, upload new product photos.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full border border-emerald-300/70 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-emerald-700">
          {uniqueImageUrls.length} images
        </span>
      </div>

      <div className="aspect-[4/3] overflow-hidden rounded-xl border border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.06)]">
        {previewImageUrl ? (
          <ProductEditorPreviewImage src={previewImageUrl} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-[color:var(--text-muted)]">
            No main image
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 min-[1500px]:grid-cols-4">
        {uniqueImageUrls.length > 0 ? (
          uniqueImageUrls.map((imageUrl, index) => {
            const isMain = index === 0;
            const isDragged = draggedImageUrl === imageUrl;
            return (
              <div
                key={`${imageUrl}-${index}`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = "move";
                  event.dataTransfer.setData("text/plain", imageUrl);
                  setDraggedImageUrl(imageUrl);
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const sourceImageUrl = event.dataTransfer.getData("text/plain") || draggedImageUrl;
                  if (sourceImageUrl && sourceImageUrl !== imageUrl) {
                    onReorderImages(sourceImageUrl, imageUrl);
                  }
                  setDraggedImageUrl("");
                }}
                onDragEnd={() => setDraggedImageUrl("")}
                className={cn(
                  "group relative aspect-square overflow-hidden rounded-xl border bg-[color:rgba(129,135,255,0.06)] transition",
                  isDragged ? "scale-[0.98] opacity-60" : "",
                  isMain ? "border-[color:var(--primary)]" : "border-[color:var(--outline)]"
                )}
              >
                <button
                  type="button"
                  className="h-full w-full"
                  onClick={() => setSelectedImageUrl(imageUrl)}
                >
                  <ProductEditorPreviewImage src={imageUrl} className="h-full w-full object-cover" />
                </button>
                {isMain ? (
                  <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-1 text-[11px] font-semibold text-foreground shadow-sm">
                    Main
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label="Delete image"
                  onClick={() => onRemoveImage(imageUrl)}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/95 p-1 text-red-600 shadow-sm opacity-100 transition hover:bg-red-50 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })
        ) : (
          <div className="col-span-full rounded-xl border border-dashed border-[color:var(--outline)] p-4 text-center text-sm text-[color:var(--text-muted)]">
            No thumbnails
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-[color:var(--text-muted)]">
        Drag thumbnails to change positions. The first image is always the main image.
      </p>

      <input
        ref={additionalImagesInputRef}
        type="file"
        accept="image/*"
        multiple
        className="sr-only"
        disabled={imageUploadLoading}
        onChange={(event) => {
          onUploadAdditionalFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <input
        ref={mainImageInputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        disabled={imageUploadLoading}
        onChange={(event) => {
          onUploadMainFiles(event.target.files);
          event.currentTarget.value = "";
        }}
      />

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Button
          type="button"
          variant="secondary"
          disabled={imageUploadLoading}
          onClick={() => mainImageInputRef.current?.click()}
        >
          Upload main image
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={imageUploadLoading}
          onClick={() => additionalImagesInputRef.current?.click()}
        >
          Add additional images
        </Button>
      </div>
    </div>
  );
}
