"use client";

import { ProductEditorGalleryCard } from "./product-editor-gallery-card";

export function ProductEditorHoodGalleryCard({
  images,
  imageUploadLoading,
  onRemoveImage,
  onReorderImages,
  onUploadFiles
}: {
  images: string[];
  imageUploadLoading: boolean;
  onRemoveImage: (imageUrl: string) => void;
  onReorderImages: (sourceImageUrl: string, targetImageUrl: string) => void;
  onUploadFiles: (files: FileList | null) => void;
}) {
  const uniqueImageUrls = Array.from(new Set(images.filter((value) => value.trim() !== "")));
  const galleryItems = uniqueImageUrls.map((imageUrl, index) => ({
    id: `${index}:${imageUrl}`,
    src: imageUrl
  }));

  return (
    <ProductEditorGalleryCard
      items={galleryItems}
      uploadLoading={imageUploadLoading}
      uploadButtonLabel={imageUploadLoading ? "Uploading images..." : "Upload images"}
      emptyPreviewLabel="No image"
      emptyGalleryLabel="No gallery images"
      onRemoveItem={(itemId) => {
        const item = galleryItems.find((entry) => entry.id === itemId);
        if (item) {
          onRemoveImage(item.src);
        }
      }}
      onReorderItems={(sourceItemId, targetItemId) => {
        const sourceItem = galleryItems.find((entry) => entry.id === sourceItemId);
        const targetItem = galleryItems.find((entry) => entry.id === targetItemId);
        if (sourceItem && targetItem) {
          onReorderImages(sourceItem.src, targetItem.src);
        }
      }}
      onUploadFiles={onUploadFiles}
    />
  );
}
