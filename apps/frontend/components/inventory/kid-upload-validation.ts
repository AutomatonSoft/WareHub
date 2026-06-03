export const MAX_KID_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_KID_UPLOAD_BATCH_FILES = 20;
const ALLOWED_KID_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export type KidUploadValidationError = "not_image" | "unsupported_format" | "too_large" | "too_many_files" | "empty_file";

export function dedupeKidUploadFiles(files: File[]): { files: File[]; skippedCount: number } {
  const seen = new Set<string>();
  const deduped: File[] = [];
  let skippedCount = 0;
  for (const file of files) {
    const signature = `${file.name}::${file.size}::${file.lastModified}::${file.type}`;
    if (seen.has(signature)) {
      skippedCount += 1;
      continue;
    }
    seen.add(signature);
    deduped.push(file);
  }
  return { files: deduped, skippedCount };
}

export function validateKidUploadFiles(files: File[]): KidUploadValidationError | null {
  if (files.length > MAX_KID_UPLOAD_BATCH_FILES) {
    return "too_many_files";
  }
  for (const file of files) {
    if (file.size <= 0) {
      return "empty_file";
    }
    if (!file.type.startsWith("image/")) {
      return "not_image";
    }
    if (!ALLOWED_KID_IMAGE_TYPES.has(file.type)) {
      return "unsupported_format";
    }
    if (file.size > MAX_KID_IMAGE_BYTES) {
      return "too_large";
    }
  }
  return null;
}
