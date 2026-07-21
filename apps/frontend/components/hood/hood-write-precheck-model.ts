import { getRequiredEanError, type Labels } from "../shared/write-guardrails-model";

export function getHoodPatchPrecheckError(input: {
  ean: string;
  uploadOnly: boolean;
  hasPatchFiles: boolean;
  payloadFieldCount: number;
  labels: Labels;
}): string | null {
  const eanError = getRequiredEanError(input.ean, input.labels);
  if (eanError) return eanError;
  if (input.uploadOnly && !input.hasPatchFiles) {
    return input.labels.selectImageFilesForUpload || "";
  }
  if (!input.uploadOnly && input.payloadFieldCount === 0 && !input.hasPatchFiles) {
    return input.labels.fillOneFieldOrSelectImages || "";
  }
  return null;
}
