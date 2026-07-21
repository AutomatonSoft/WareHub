"use client";

import { useEffect, useRef, useState, type SyntheticEvent } from "react";
import { useLabels } from "../../app/use-labels";
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop
} from "react-image-crop";

import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "../ui/dialog";

function centerAspectCrop(mediaWidth: number, mediaHeight: number, aspect: number): Crop {
  return centerCrop(
    makeAspectCrop(
      {
        unit: "%",
        width: 70
      },
      aspect,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  );
}

async function buildCroppedBlob(image: HTMLImageElement, crop: PixelCrop, errorMessage: string): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;

  canvas.width = Math.floor(crop.width * scaleX);
  canvas.height = Math.floor(crop.height * scaleY);

  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error(errorMessage);
  }

  context.imageSmoothingQuality = "high";
  context.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((value) => resolve(value), "image/png", 1);
  });

  if (!blob) {
    throw new Error(errorMessage);
  }

  return blob;
}

export function ProfileAvatarCropDialog({
  open,
  uploading,
  imageUrl,
  onOpenChange,
  onCancel,
  onSave
}: {
  open: boolean;
  uploading: boolean;
  imageUrl: string | null;
  onOpenChange: (open: boolean) => void;
  onCancel: () => void;
  onSave: (blob: Blob) => Promise<void>;
}) {
  const t = useLabels();
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();

  useEffect(() => {
    if (!open) {
      setCrop(undefined);
      setCompletedCrop(undefined);
      imageRef.current = null;
    }
  }, [open]);

  function handleImageLoad(event: SyntheticEvent<HTMLImageElement>) {
    const { width, height } = event.currentTarget;
    setCrop(centerAspectCrop(width, height, 1));
  }

  async function handleSave() {
    if (!imageRef.current || !completedCrop?.width || !completedCrop?.height) {
      return;
    }

    const blob = await buildCroppedBlob(imageRef.current, completedCrop, t.failedPrepareAvatarImage);
    await onSave(blob);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && uploading) {
          return;
        }
        onOpenChange(nextOpen);
      }}
    >
      <DialogContent className="!flex !flex-col !w-[min(960px,calc(100vw-32px))] !max-w-[960px] !gap-0 overflow-hidden !p-0 max-h-[calc(100vh-32px)]">
        <DialogHeader className="border-b border-border px-5 py-4 sm:px-6">
          <DialogTitle>{t.adjustAvatar}</DialogTitle>
          <DialogDescription>
            {t.cropAvatarHint}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex min-h-[360px] items-center justify-center overflow-auto rounded-[var(--radius-card)] border border-border bg-black/80 p-3 sm:min-h-[520px] sm:p-5">
            {imageUrl ? (
              <ReactCrop
                crop={crop}
                onChange={(nextCrop) => setCrop(nextCrop)}
                onComplete={(nextCrop) => setCompletedCrop(nextCrop)}
                aspect={1}
                minWidth={120}
                keepSelection
                className="max-h-[70vh] max-w-full"
              >
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt={t.avatarCropPreview}
                  onLoad={handleImageLoad}
                  className="max-h-[70vh] max-w-full object-contain"
                />
              </ReactCrop>
            ) : null}
          </div>
        </div>

        <DialogFooter className="border-t border-border px-4 py-4 sm:px-6">
          <Button type="button" variant="outline" disabled={uploading} onClick={onCancel}>
            {t.cancel}
          </Button>
          <Button type="button" disabled={uploading || !completedCrop?.width || !completedCrop?.height} onClick={() => void handleSave()}>
            {uploading ? t.saving : t.crop}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
