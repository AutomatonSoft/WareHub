"use client";

import Image from "next/image";
import { ImagePlus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../../shared/button";
import { Card } from "../../ui/card";
import type { KidMeta } from "./kid-details-types";

type PendingUploadSummary = {
  count: number;
  totalSizeLabel: string;
  compressibleCount: number;
};

type NamesPreview = {
  visibleNames: string[];
  hiddenCount: number;
};

type RetryDiagnostics = {
  attempt: number;
  remaining: number;
  cooldownSeconds: number;
  max: number;
};

export function KidDetailsGalleryCard(props: {
  t: Record<string, string>;
  kidMeta: KidMeta;
  uploadingImages: boolean;
  retryingUpload: boolean;
  failedUploadFiles: File[];
  pendingUploadSummary: PendingUploadSummary | null;
  pendingUploadNamesPreview: NamesPreview;
  failedUploadNamesPreview: NamesPreview;
  retryDiagnostics: RetryDiagnostics | null;
  uploadRetryCooldownUntil: number;
  retryClockNow: number;
  uploadRetryAttempt: number;
  retryMaxAttempts: number;
  lastDeletedImageUrl: string | null;
  savingMainImage: boolean;
  removingImage: boolean;
  reorderingImage: boolean;
  restoringImage: boolean;
  onUploadImages: (files: FileList | null) => Promise<void>;
  onRetryUpload: () => Promise<void>;
  onClearFailedUploadBatch: () => void;
  onCopyFailedUploadNames: () => Promise<void>;
  onRestoreDeletedImage: () => Promise<void>;
  onClearPendingUploadBatch: () => void;
  onMoveImage: (imageUrl: string, direction: "up" | "down") => Promise<void>;
  onSetMainImage: (imageUrl: string) => Promise<void>;
  onDeleteImage: (imageUrl: string) => Promise<void>;
}) {
  const {
    t,
    kidMeta,
    uploadingImages,
    retryingUpload,
    failedUploadFiles,
    pendingUploadSummary,
    pendingUploadNamesPreview,
    failedUploadNamesPreview,
    retryDiagnostics,
    uploadRetryCooldownUntil,
    retryClockNow,
    uploadRetryAttempt,
    retryMaxAttempts,
    lastDeletedImageUrl,
    savingMainImage,
    removingImage,
    reorderingImage,
    restoringImage,
    onUploadImages,
    onRetryUpload,
    onClearFailedUploadBatch,
    onCopyFailedUploadNames,
    onRestoreDeletedImage,
    onClearPendingUploadBatch,
    onMoveImage,
    onSetMainImage,
    onDeleteImage
  } = props;

  const [selectedImageUrl, setSelectedImageUrl] = useState("");
  const galleryItems = kidMeta.gallery.items;
  const imageUrls = kidMeta.photos;
  const selectedImage = useMemo(() => {
    const match = galleryItems.find((item) => item.url === selectedImageUrl);
    return match ?? galleryItems[0] ?? null;
  }, [galleryItems, selectedImageUrl]);
  const selectedIndex = selectedImage ? imageUrls.findIndex((item) => item === selectedImage.url) : -1;
  const canMoveUp = selectedIndex > 0;
  const canMoveDown = selectedIndex >= 0 && selectedIndex < imageUrls.length - 1;
  const canSetMain = selectedIndex > 0;
  const imageActionBusy = savingMainImage || removingImage || reorderingImage || restoringImage || uploadingImages || retryingUpload;

  return (
    <Card className="rounded-2xl border border-[color:var(--outline)] bg-white/95 p-5 shadow-sm">
      <div className="space-y-1">
        <h3 className="text-base font-semibold text-[color:var(--text-primary)]">Gallery</h3>
        <p className="text-sm text-[color:var(--text-secondary)]">Images: {galleryItems.length}</p>
        <p className="text-xs text-[color:var(--text-muted)]">Upload to FTP, save the URL on KID, then Hood downloads it on its side.</p>
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.05)]">
        {selectedImage ? (
          <a
            href={selectedImage.url}
            target="_blank"
            rel="noreferrer"
            className="block aspect-[4/3] overflow-hidden"
          >
            <Image
              src={selectedImage.url}
              alt={kidMeta.kidNumber}
              width={1200}
              height={900}
              unoptimized
              className="h-full w-full object-contain"
            />
          </a>
        ) : (
          <div className="flex aspect-[4/3] items-center justify-center text-sm text-[color:var(--text-muted)]">{t.noPhoto}</div>
        )}
      </div>

      {selectedImage ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.08)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-secondary)]">
            {selectedImage.isMain ? "Main image" : `Image ${selectedIndex + 1}`}
          </span>
          <span className="rounded-full border border-[color:var(--outline)] bg-white px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-[color:var(--text-secondary)]">
            {selectedImage.source}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button type="button" variant="secondary" onClick={() => void onMoveImage(selectedImage.url, "up")} disabled={!canMoveUp || imageActionBusy}>
              {t.moveUp}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onMoveImage(selectedImage.url, "down")} disabled={!canMoveDown || imageActionBusy}>
              {t.moveDown}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onSetMainImage(selectedImage.url)} disabled={!canSetMain || imageActionBusy}>
              {t.setMain}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void onDeleteImage(selectedImage.url)} disabled={imageActionBusy}>
              {t.delete}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-5">
        {galleryItems.length > 0 ? (
          galleryItems.map((item, index) => {
            const isSelected = (selectedImage?.url || galleryItems[0]?.url || "") === item.url;
            return (
              <div
                key={item.id}
                className={`group relative overflow-hidden rounded-2xl border bg-[color:rgba(129,135,255,0.05)] ${
                  isSelected ? "border-[color:var(--primary)] shadow-[0_0_0_1px_var(--primary)]" : "border-[color:var(--outline)]"
                }`}
              >
                <button type="button" className="block w-full" onClick={() => setSelectedImageUrl(item.url)}>
                  <div className="aspect-[4/3] overflow-hidden">
                    <Image
                      src={item.url}
                      alt={`${kidMeta.kidNumber} ${index + 1}`}
                      width={320}
                      height={240}
                      unoptimized
                      className="h-full w-full object-cover"
                    />
                  </div>
                </button>
                {item.isMain ? (
                  <span className="absolute left-2 top-2 rounded-full bg-white/95 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--text-primary)]">
                    Main
                  </span>
                ) : null}
                <button
                  type="button"
                  aria-label={`Delete image ${index + 1}`}
                  onClick={() => void onDeleteImage(item.url)}
                  disabled={imageActionBusy}
                  className="absolute right-2 top-2 rounded-full bg-white/95 p-1 text-[color:var(--warning)] shadow-sm transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60 sm:opacity-0 sm:group-hover:opacity-100"
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              </div>
            );
          })
        ) : (
          <div className="col-span-full rounded-2xl border border-dashed border-[color:var(--outline)] p-4 text-center text-sm text-[color:var(--text-muted)]">
            {t.noPhoto}
          </div>
        )}
      </div>

      <p className="mt-4 text-xs text-[color:var(--text-muted)]">Removed images stay on FTP.</p>

      <div className="mt-3 rounded-2xl border border-dashed border-[color:var(--outline)] bg-[color:rgba(129,135,255,0.03)] p-4">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] text-[color:var(--text-secondary)]">Pending uploads</div>
        <label
          tabIndex={0}
          className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-[color:var(--outline)] bg-white px-4 py-3 text-sm text-[color:var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-[color:var(--primary)]"
        >
          <ImagePlus size={18} className="shrink-0 text-[color:var(--primary)]" aria-hidden="true" />
          <span>{uploadingImages ? "Uploading to FTP..." : "Select images to upload to FTP"}</span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={uploadingImages || retryingUpload}
            onChange={(event) => void onUploadImages(event.target.files)}
          />
        </label>
        {pendingUploadSummary ? (
          <div className="mt-3 text-xs text-[color:var(--text-secondary)]">
            {t.uploadBatchSummary
              .replace("{count}", String(pendingUploadSummary.count))
              .replace("{sizeMb}", pendingUploadSummary.totalSizeLabel)
              .replace("{compressible}", String(pendingUploadSummary.compressibleCount))}
          </div>
        ) : null}
        {pendingUploadSummary ? (
          <div className="mt-2 text-xs text-[color:var(--text-muted)]">
            {t.uploadBatchFiles}: {pendingUploadNamesPreview.visibleNames.join(", ")}
            {pendingUploadNamesPreview.hiddenCount > 0
              ? ` ${t.uploadBatchFilesMore.replace("{count}", String(pendingUploadNamesPreview.hiddenCount))}`
              : ""}
          </div>
        ) : null}
        {pendingUploadSummary ? (
          <div className="mt-3">
            <Button type="button" variant="secondary" onClick={onClearPendingUploadBatch} disabled={uploadingImages || retryingUpload}>
              {t.clearSelectedUploadBatch}
            </Button>
          </div>
        ) : null}
      </div>

      {failedUploadFiles.length > 0 ? (
        <div className="mt-3 rounded-2xl border border-[color:var(--outline)] bg-[color:rgba(255,184,0,0.08)] p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onRetryUpload()}
              disabled={
                uploadingImages ||
                retryingUpload ||
                uploadRetryCooldownUntil > retryClockNow ||
                uploadRetryAttempt >= retryMaxAttempts
              }
            >
              {uploadRetryAttempt >= retryMaxAttempts
                ? t.uploadRetryLimitReached.replace("{max}", String(retryMaxAttempts))
                : uploadRetryCooldownUntil > retryClockNow
                  ? t.uploadRetryCooldown.replace(
                      "{seconds}",
                      String(Math.max(1, Math.ceil((uploadRetryCooldownUntil - retryClockNow) / 1000)))
                    )
                  : retryingUpload
                    ? t.retryingUpload.replace("{count}", String(failedUploadFiles.length))
                    : t.retryUpload.replace("{count}", String(failedUploadFiles.length))}
            </Button>
            <Button type="button" variant="secondary" onClick={onClearFailedUploadBatch} disabled={uploadingImages || retryingUpload}>
              {t.clearFailedUploadBatch}
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onCopyFailedUploadNames()}
              disabled={uploadingImages || retryingUpload || failedUploadFiles.length === 0}
            >
              {t.copyFailedUploadNames}
            </Button>
            {lastDeletedImageUrl ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => void onRestoreDeletedImage()}
                disabled={imageActionBusy}
              >
                {restoringImage ? t.restoringImage : t.restoreLastDeletedImage}
              </Button>
            ) : null}
          </div>
          <div className="mt-3 text-xs text-[color:var(--text-muted)]">
            {t.failedUploadBatchFiles}: {failedUploadNamesPreview.visibleNames.join(", ")}
            {failedUploadNamesPreview.hiddenCount > 0
              ? ` ${t.uploadBatchFilesMore.replace("{count}", String(failedUploadNamesPreview.hiddenCount))}`
              : ""}
          </div>
          {retryDiagnostics ? (
            <div className="mt-2 text-xs text-[color:var(--text-secondary)]">
              {t.uploadRetryDiagnostics
                .replace("{attempt}", String(retryDiagnostics.attempt))
                .replace("{max}", String(retryDiagnostics.max))
                .replace("{remaining}", String(retryDiagnostics.remaining))
                .replace("{cooldown}", String(retryDiagnostics.cooldownSeconds))}
            </div>
          ) : null}
        </div>
      ) : lastDeletedImageUrl ? (
        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void onRestoreDeletedImage()}
            disabled={imageActionBusy}
          >
            {restoringImage ? t.restoringImage : t.restoreLastDeletedImage}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
