export const KID_IMAGE_COMPRESSION_THRESHOLD_BYTES = 2 * 1024 * 1024;
export const KID_IMAGE_COMPRESSION_MAX_DIMENSION = 2048;
export const KID_IMAGE_COMPRESSION_QUALITY = 0.82;

const COMPRESSIBLE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function shouldCompressKidImage(file: File): boolean {
  return COMPRESSIBLE_TYPES.has(file.type) && file.size >= KID_IMAGE_COMPRESSION_THRESHOLD_BYTES;
}

async function fileToBitmap(file: File): Promise<ImageBitmap> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file);
  }

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const node = new Image();
      node.onload = () => resolve(node);
      node.onerror = () => reject(new Error("Failed to decode image."));
      node.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth || img.width;
    canvas.height = img.naturalHeight || img.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("2d context unavailable.");
    }
    ctx.drawImage(img, 0, 0);
    const bitmap = await createImageBitmap(canvas);
    return bitmap;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function compressKidImageFile(file: File): Promise<File> {
  if (!shouldCompressKidImage(file)) {
    return file;
  }

  const bitmap = await fileToBitmap(file);
  try {
    const ratio = Math.min(
      1,
      KID_IMAGE_COMPRESSION_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height)
    );
    const width = Math.max(1, Math.round(bitmap.width * ratio));
    const height = Math.max(1, Math.round(bitmap.height * ratio));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, file.type, KID_IMAGE_COMPRESSION_QUALITY);
    });
    if (!blob) return file;
    if (blob.size >= file.size * 0.97) return file;

    return new File([blob], file.name, {
      type: blob.type || file.type,
      lastModified: file.lastModified,
    });
  } finally {
    bitmap.close();
  }
}

export async function compressKidUploadFiles(files: File[]): Promise<{ files: File[]; compressedCount: number }> {
  const result: File[] = [];
  let compressedCount = 0;

  for (const file of files) {
    try {
      const compressed = await compressKidImageFile(file);
      if (compressed !== file) {
        compressedCount += 1;
      }
      result.push(compressed);
    } catch {
      result.push(file);
    }
  }

  return { files: result, compressedCount };
}
