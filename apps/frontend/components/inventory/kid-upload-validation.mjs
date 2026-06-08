export const MAX_KID_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_KID_UPLOAD_BATCH_FILES = 20;
const ALLOWED_KID_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function dedupeKidUploadFiles(files) {
  const seen = new Set();
  const deduped = [];
  let skippedCount = 0;
  for (const file of files) {
    const signature = `${file?.name || ""}::${Number(file?.size || 0)}::${Number(file?.lastModified || 0)}::${file?.type || ""}`;
    if (seen.has(signature)) {
      skippedCount += 1;
      continue;
    }
    seen.add(signature);
    deduped.push(file);
  }
  return { files: deduped, skippedCount };
}

export function validateKidUploadFiles(files) {
  if (files.length > MAX_KID_UPLOAD_BATCH_FILES) {
    return "too_many_files";
  }
  for (const file of files) {
    if (Number(file?.size || 0) <= 0) {
      return "empty_file";
    }
    if (!String(file?.type || "").startsWith("image/")) {
      return "not_image";
    }
    if (!ALLOWED_KID_IMAGE_TYPES.has(file.type)) {
      return "unsupported_format";
    }
    if (Number(file?.size || 0) > MAX_KID_IMAGE_BYTES) {
      return "too_large";
    }
  }
  return null;
}
