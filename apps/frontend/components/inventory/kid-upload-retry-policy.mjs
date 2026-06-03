export const KID_UPLOAD_RETRY_MAX_ATTEMPTS = 3;

export function getKidUploadRetryCooldownMs(attempt) {
  if (attempt <= 0) return 0;
  return Math.min(30000, 2000 * 2 ** (attempt - 1));
}

export function canRetryKidUpload(attempt) {
  return attempt < KID_UPLOAD_RETRY_MAX_ATTEMPTS;
}
