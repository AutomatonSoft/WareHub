import { useMemo, useState } from "react";
import type { KidMeta } from "./kid-details-types";
import { mergeUniqueImageUrls } from "../image-gallery-model";
import { isEan13 } from "../ean-utils";
import { shouldCompressKidImage, compressKidUploadFiles } from "../kid-image-compression";
import { formatUploadBytes } from "../upload-batch-summary";
import { buildUploadFileListPreview } from "../upload-file-list-preview";
import { MAX_KID_UPLOAD_BATCH_FILES, dedupeKidUploadFiles, validateKidUploadFiles } from "../kid-upload-validation";
import { canRetryKidUpload, getKidUploadRetryCooldownMs, KID_UPLOAD_RETRY_MAX_ATTEMPTS } from "../kid-upload-retry-policy";
import { patchKidPhotoUrls, reservePoolEan, takeNextPoolEan, uploadKidImages } from "../inventory-api";
import { formatApiErrorText } from "../inventory-api-errors";

type Labels = Record<string, string>;

export function useKidDetailsMediaActions({
  t,
  kidId,
  kidMeta,
  load,
}: {
  t: Labels;
  kidId: number;
  kidMeta: KidMeta | null;
  load: () => Promise<void>;
}) {
  const [uploadingImages, setUploadingImages] = useState(false);
  const [retryingUpload, setRetryingUpload] = useState(false);
  const [failedUploadFiles, setFailedUploadFiles] = useState<File[]>([]);
  const [pendingUploadFiles, setPendingUploadFiles] = useState<File[]>([]);
  const [uploadRetryAttempt, setUploadRetryAttempt] = useState(0);
  const [uploadRetryCooldownUntil, setUploadRetryCooldownUntil] = useState(0);
  const [lastDeletedImageUrl, setLastDeletedImageUrl] = useState<string | null>(null);
  const [savingMainImage, setSavingMainImage] = useState(false);
  const [removingImage, setRemovingImage] = useState(false);
  const [reorderingImage, setReorderingImage] = useState(false);
  const [restoringImage, setRestoringImage] = useState(false);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [draftEan, setDraftEan] = useState("");
  const [eanActionLoading, setEanActionLoading] = useState(false);
  const [eanStatus, setEanStatus] = useState<string | null>(null);

  async function handleUploadImages(files: FileList | null) {
    if (!files || files.length === 0 || !kidMeta) return;
    const rawFiles = Array.from(files);
    const dedupeResult = dedupeKidUploadFiles(rawFiles);
    const fileList = dedupeResult.files;
    setPendingUploadFiles(fileList);
    if (fileList.length === 0) {
      setFailedUploadFiles([]);
      setUploadInfo(t.uploadAllFilesDuplicate);
      setPendingUploadFiles([]);
      return;
    }
    const validationError = validateKidUploadFiles(fileList);
    if (validationError) {
      setFailedUploadFiles([]);
      if (validationError === "not_image") setUploadInfo(t.uploadImagesMustBeImage);
      if (validationError === "unsupported_format") setUploadInfo(t.uploadImagesUnsupportedFormat);
      if (validationError === "empty_file") setUploadInfo(t.uploadImagesEmptyFile);
      if (validationError === "too_large") setUploadInfo(t.uploadImagesTooLarge);
      if (validationError === "too_many_files") {
        setUploadInfo(t.uploadTooManyFiles.replace("{max}", String(MAX_KID_UPLOAD_BATCH_FILES)));
      }
      setPendingUploadFiles([]);
      return;
    }
    setUploadingImages(true);
    setUploadInfo(null);
    try {
      const compressed = await compressKidUploadFiles(fileList);
      const uploadedUrls = await uploadKidImages(compressed.files);
      const merged = mergeUniqueImageUrls(kidMeta.photos, uploadedUrls);
      await patchKidPhotoUrls(kidId, merged);
      const uploadedBase = `Uploaded ${uploadedUrls.length} image(s) to FTP and saved the URL list on KID.`;
      const notes: string[] = [uploadedBase];
      if (dedupeResult.skippedCount > 0) {
        notes.push(t.uploadDuplicatesSkipped.replace("{count}", String(dedupeResult.skippedCount)));
      }
      if (compressed.compressedCount > 0) {
        notes.push(t.uploadImagesCompressed.replace("{count}", String(compressed.compressedCount)));
      }
      setUploadInfo(notes.join(" "));
      setFailedUploadFiles([]);
      setUploadRetryAttempt(0);
      setUploadRetryCooldownUntil(0);
      setPendingUploadFiles([]);
      await load();
    } catch (requestError) {
      setFailedUploadFiles(fileList);
      setUploadRetryAttempt(0);
      setUploadRetryCooldownUntil(0);
      setUploadInfo(requestError instanceof Error ? requestError.message : "Image upload failed.");
    } finally {
      setUploadingImages(false);
    }
  }

  async function handleRetryUpload() {
    if (!kidMeta || failedUploadFiles.length === 0 || uploadingImages || retryingUpload) return;
    if (!canRetryKidUpload(uploadRetryAttempt)) {
      setUploadInfo(t.uploadRetryLimitReached.replace("{max}", String(KID_UPLOAD_RETRY_MAX_ATTEMPTS)));
      return;
    }
    if (uploadRetryCooldownUntil > Date.now()) return;
    setRetryingUpload(true);
    setUploadInfo(null);
    try {
      const compressed = await compressKidUploadFiles(failedUploadFiles);
      const uploadedUrls = await uploadKidImages(compressed.files);
      const merged = mergeUniqueImageUrls(kidMeta.photos, uploadedUrls);
      await patchKidPhotoUrls(kidId, merged);
      const base = `${t.uploadRetrySuccess.replace("{count}", String(uploadedUrls.length))} FTP URLs were saved on KID.`;
      setUploadInfo(
        compressed.compressedCount > 0
          ? `${base} ${t.uploadImagesCompressed.replace("{count}", String(compressed.compressedCount))}`
          : base
      );
      setFailedUploadFiles([]);
      setUploadRetryAttempt(0);
      setUploadRetryCooldownUntil(0);
      setPendingUploadFiles([]);
      await load();
    } catch (requestError) {
      const nextAttempt = uploadRetryAttempt + 1;
      const cooldownMs = getKidUploadRetryCooldownMs(nextAttempt);
      setUploadRetryAttempt(nextAttempt);
      setUploadRetryCooldownUntil(Date.now() + cooldownMs);
      setUploadInfo(requestError instanceof Error ? requestError.message : t.uploadRetryFailed);
    } finally {
      setRetryingUpload(false);
    }
  }

  function handleClearFailedUploadBatch() {
    if (retryingUpload || uploadingImages) return;
    setFailedUploadFiles([]);
    setUploadRetryAttempt(0);
    setUploadRetryCooldownUntil(0);
    setUploadInfo(t.uploadFailedBatchCleared);
  }

  function handleClearPendingUploadBatch() {
    if (uploadingImages || retryingUpload) return;
    setPendingUploadFiles([]);
    setUploadInfo(t.uploadPendingBatchCleared);
  }

  async function handleCopyFailedUploadNames() {
    if (failedUploadFiles.length === 0) return;
    const payload = failedUploadFiles.map((file) => file.name).join(", ");
    if (!payload) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(payload);
        setUploadInfo(t.failedUploadNamesCopied);
        return;
      }
    } catch {}
    try {
      const ok = window.prompt(t.copyFailedNamesPrompt, payload);
      if (ok !== null) {
        setUploadInfo(t.failedUploadNamesCopied);
      }
    } catch {
      setUploadInfo(t.failedUploadNamesCopyFailed);
    }
  }

  async function handleSetMainImage(imageUrl: string) {
    if (!kidMeta || savingMainImage || removingImage || kidMeta.photos.length <= 1) return;
    const normalized = imageUrl.trim();
    if (!normalized) return;
    const reordered = mergeUniqueImageUrls([normalized], kidMeta.photos);
    if (reordered.length === kidMeta.photos.length && reordered[0] === kidMeta.photos[0]) return;
    setSavingMainImage(true);
    setUploadInfo(null);
    try {
      await patchKidPhotoUrls(kidId, reordered);
      setUploadInfo("Main image updated in the saved FTP URL order.");
      await load();
    } catch (requestError) {
      setUploadInfo(requestError instanceof Error ? requestError.message : "Failed to update main image.");
    } finally {
      setSavingMainImage(false);
    }
  }

  async function handleDeleteImage(imageUrl: string) {
    if (!kidMeta || savingMainImage || removingImage || reorderingImage || restoringImage) return;
    const normalized = imageUrl.trim();
    if (!normalized) return;
    const confirmed = window.confirm(t.confirmDeleteImage);
    if (!confirmed) return;
    const nextPhotos = kidMeta.photos.filter((item) => item !== normalized);
    if (nextPhotos.length === kidMeta.photos.length) return;
    setRemovingImage(true);
    setUploadInfo(null);
    try {
      await patchKidPhotoUrls(kidId, nextPhotos);
      setUploadInfo(t.imageDeleted);
      setLastDeletedImageUrl(normalized);
      await load();
    } catch (requestError) {
      setUploadInfo(requestError instanceof Error ? requestError.message : t.deleteImageFailed);
    } finally {
      setRemovingImage(false);
    }
  }

  async function handleRestoreDeletedImage() {
    if (!kidMeta || !lastDeletedImageUrl || savingMainImage || removingImage || reorderingImage || restoringImage) return;
    const normalized = lastDeletedImageUrl.trim();
    if (!normalized) return;
    const nextPhotos = mergeUniqueImageUrls(kidMeta.photos, [normalized]);
    if (nextPhotos.length === kidMeta.photos.length) {
      setLastDeletedImageUrl(null);
      return;
    }
    setRestoringImage(true);
    setUploadInfo(null);
    try {
      await patchKidPhotoUrls(kidId, nextPhotos);
      setUploadInfo(t.imageRestored);
      setLastDeletedImageUrl(null);
      await load();
    } catch (requestError) {
      setUploadInfo(requestError instanceof Error ? requestError.message : t.restoreImageFailed);
    } finally {
      setRestoringImage(false);
    }
  }

  async function handleMoveImage(imageUrl: string, direction: "up" | "down") {
    if (!kidMeta || savingMainImage || removingImage || reorderingImage) return;
    const normalized = imageUrl.trim();
    if (!normalized) return;
    const currentIndex = kidMeta.photos.findIndex((item) => item === normalized);
    if (currentIndex < 0) return;
    const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= kidMeta.photos.length) return;
    const nextPhotos = [...kidMeta.photos];
    const [moved] = nextPhotos.splice(currentIndex, 1);
    nextPhotos.splice(targetIndex, 0, moved);
    setReorderingImage(true);
    setUploadInfo(null);
    try {
      await patchKidPhotoUrls(kidId, nextPhotos);
      setUploadInfo(t.imageOrderUpdated);
      await load();
    } catch (requestError) {
      setUploadInfo(requestError instanceof Error ? requestError.message : t.imageOrderUpdateFailed);
    } finally {
      setReorderingImage(false);
    }
  }

  async function handleTakeNextEan() {
    if (eanActionLoading) return;
    const confirmed = window.confirm(t.confirmTakeNextEan);
    if (!confirmed) return;
    setEanActionLoading(true);
    setEanStatus(null);
    try {
      const { response, ean, errorText } = await takeNextPoolEan();
      if (!response.ok || !ean) {
        setEanStatus(formatApiErrorText(response.status, errorText, t.takeNextEanFailed));
        return;
      }
      setDraftEan(ean);
      setEanStatus(t.draftEanAssignedForKid.replace("{kidId}", String(kidId)).replace("{ean}", ean));
    } catch (requestError) {
      setEanStatus(requestError instanceof Error ? requestError.message : t.takeNextEanFailed);
    } finally {
      setEanActionLoading(false);
    }
  }

  async function handleReserveDraftEan() {
    if (eanActionLoading) return;
    const normalized = draftEan.trim();
    if (!normalized) {
      setEanStatus(t.draftEanEmpty);
      return;
    }
    if (!isEan13(normalized)) {
      setEanStatus(t.draftEanInvalid);
      return;
    }
    const confirmed = window.confirm(t.confirmReserveDraftEan.replace("{ean}", normalized));
    if (!confirmed) return;
    setEanActionLoading(true);
    setEanStatus(null);
    try {
      const { response, errorText } = await reservePoolEan(normalized);
      if (!response.ok) {
        setEanStatus(formatApiErrorText(response.status, errorText, t.reserveEanFailed));
        return;
      }
      setEanStatus(t.eanReservedInPool.replace("{ean}", normalized));
    } catch (requestError) {
      setEanStatus(requestError instanceof Error ? requestError.message : t.reserveEanFailed);
    } finally {
      setEanActionLoading(false);
    }
  }

  const pendingUploadSummary = useMemo(() => {
    if (pendingUploadFiles.length === 0) return null;
    const totalBytes = pendingUploadFiles.reduce((sum, file) => sum + file.size, 0);
    const compressibleCount = pendingUploadFiles.filter((file) => shouldCompressKidImage(file)).length;
    return {
      count: pendingUploadFiles.length,
      totalSizeLabel: formatUploadBytes(totalBytes),
      compressibleCount,
      names: pendingUploadFiles.map((file) => file.name),
    };
  }, [pendingUploadFiles]);

  const pendingUploadNamesPreview = useMemo(
    () => buildUploadFileListPreview(pendingUploadSummary?.names ?? [], 5),
    [pendingUploadSummary]
  );
  const failedUploadNamesPreview = useMemo(
    () => buildUploadFileListPreview(failedUploadFiles.map((file) => file.name), 5),
    [failedUploadFiles]
  );

  return {
    uploadingImages,
    retryingUpload,
    failedUploadFiles,
    pendingUploadSummary,
    pendingUploadNamesPreview,
    failedUploadNamesPreview,
    uploadRetryAttempt,
    uploadRetryCooldownUntil,
    lastDeletedImageUrl,
    savingMainImage,
    removingImage,
    reorderingImage,
    restoringImage,
    uploadInfo,
    draftEan,
    eanActionLoading,
    eanStatus,
    setDraftEan,
    handleUploadImages,
    handleRetryUpload,
    handleClearFailedUploadBatch,
    handleCopyFailedUploadNames,
    handleRestoreDeletedImage,
    handleClearPendingUploadBatch,
    handleTakeNextEan,
    handleReserveDraftEan,
    handleMoveImage,
    handleSetMainImage,
    handleDeleteImage,
    KID_UPLOAD_RETRY_MAX_ATTEMPTS,
  };
}
