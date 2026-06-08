import { getRequiredEanError } from "../shared/write-guardrails-model.mjs";
export { getRequiredEanError };

export function getHoodPatchPrecheckError(input) {
  const labels = input?.labels || {};
  const eanError = getRequiredEanError(input?.ean, labels);
  if (eanError) return eanError;
  if (Boolean(input?.uploadOnly) && !Boolean(input?.hasPatchFiles)) {
    return labels.selectImageFilesForUpload || "Select image files for upload.";
  }
  if (!Boolean(input?.uploadOnly) && Number(input?.payloadFieldCount || 0) === 0 && !Boolean(input?.hasPatchFiles)) {
    return labels.fillOneFieldOrSelectImages || "Fill at least one field or select image files.";
  }
  return null;
}
