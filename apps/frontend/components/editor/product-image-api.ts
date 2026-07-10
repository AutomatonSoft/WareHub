import { apiFetch } from "../../lib/api/client";

export function extractUploadedImageUrls(payload: unknown): string[] {
  if (typeof payload !== "object" || payload === null) {
    return [];
  }
  const raw = (payload as { uploaded_image_urls?: unknown }).uploaded_image_urls;
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map((item) => String(item || "").trim()).filter(Boolean);
}

export async function uploadProductImages(files: File[]): Promise<string[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("images", file);
  }

  const response = await apiFetch("/api/v1/uploads/images/", {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    throw new Error(`product_image_upload_failed_http:${response.status}`);
  }

  const payload = (await response.json()) as unknown;
  const urls = extractUploadedImageUrls(payload);
  if (urls.length === 0) {
    throw new Error("product_image_upload_no_urls");
  }
  return urls;
}

