"use client";

import { useLabels } from "../../app/use-labels";
import { CreateProductImageGallery } from "../product-forms";

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
  const t = useLabels();
  const uniqueImageUrls = Array.from(new Set(images.filter((value) => value.trim() !== "")));
  const galleryItems = uniqueImageUrls.map((imageUrl, index) => ({
    id: `${index}:${imageUrl}`,
    src: imageUrl,
    isLocal: false,
  }));

  return (
    <CreateProductImageGallery
      items={galleryItems}
      activeItemId={galleryItems[0]?.id ?? ""}
      previewAlt={t.createProductJvGalleryPreview}
      emptyPreviewLabel={t.productEditorNoImage}
      emptyGalleryLabel={t.createProductNoGalleryImages}
      uploadLabel={imageUploadLoading ? t.uploadingImages : t.productEditorUploadImagesAction}
      thumbnailAlt={(index) => t.createProductJvGalleryThumbnail.replace("{index}", String(index + 1))}
      deleteAlt={(index) => t.createProductDeleteImage.replace("{index}", String(index + 1))}
      onActiveItemChange={() => undefined}
      onDeleteItem={(itemId) => {
        const item = galleryItems.find((entry) => entry.id === itemId);
        if (item) {
          onRemoveImage(item.src);
        }
      }}
      onMoveItem={(sourceItemId, targetItemId) => {
        const sourceItem = galleryItems.find((entry) => entry.id === sourceItemId);
        const targetItem = galleryItems.find((entry) => entry.id === targetItemId);
        if (sourceItem && targetItem) {
          onReorderImages(sourceItem.src, targetItem.src);
        }
      }}
      onFilesSelected={onUploadFiles}
    />
  );
}
