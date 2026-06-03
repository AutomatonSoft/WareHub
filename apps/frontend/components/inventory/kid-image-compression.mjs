export const KID_IMAGE_COMPRESSION_THRESHOLD_BYTES = 2 * 1024 * 1024;
const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function shouldCompressKidImage(file) {
  return COMPRESSIBLE_TYPES.has(file?.type) && Number(file?.size || 0) >= KID_IMAGE_COMPRESSION_THRESHOLD_BYTES;
}
