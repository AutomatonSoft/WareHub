export type HoodAccount = "xl" | "jv";

export type HoodItem = {
  ean: string;
  item_id: string;
  title: string;
  description: string;
  image: string;
  images?: string[];
};

export type HoodStatusMeta = {
  response_id?: number;
  local_save_status?: string;
  external_push_status?: string;
  external_push_error?: string;
  updated_at?: string;
};

export type HoodResponse = {
  account?: string;
  ean?: string;
  items?: HoodItem[];
  external_payload?: unknown;
  status_meta?: HoodStatusMeta | null;
  external_status?: string;
  external_success?: boolean;
  uploaded_image_urls?: string[];
  deleted_url?: string;
  detail?: string;
  status_code?: number;
  body?: string;
};

export type HoodPatchForm = {
  title: string;
  description: string;
  price: string;
  quantity: string;
  categoryID: string;
  condition: string;
  itemMode: string;
  itemNumber: string;
  imagesText: string;
};

export const PATCH_FORM_FIELD_KEYS: Array<keyof HoodPatchForm> = [
  "title",
  "description",
  "price",
  "quantity",
  "categoryID",
  "condition",
  "itemMode",
  "itemNumber",
  "imagesText"
];

export function statusBadgeClass(status?: string): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "saved" || normalized === "pushed") {
    return "ui-status-chip ui-status-success";
  }
  if (normalized === "failed") {
    return "ui-status-chip ui-status-danger";
  }
  return "ui-status-chip ui-status-warning";
}

export function decodeHtmlEntities(value: string): string {
  if (!value) return "";
  if (typeof window === "undefined") return value;

  const textarea = document.createElement("textarea");
  let current = value;
  for (let index = 0; index < 10; index += 1) {
    textarea.innerHTML = current;
    const decoded = textarea.value;
    if (decoded === current) break;
    current = decoded;
  }
  return current;
}

export function htmlToPlainText(value: string): string {
  const decoded = decodeHtmlEntities(value);
  if (!decoded) return "";

  if (typeof window === "undefined") {
    return decoded
      .replace(/<(script|style|link|meta|head|title|noscript)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<\/?(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n")
      .replace(/<[^>]*>/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  const withBreaks = decoded.replace(/<\/?(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, "\n");
  const container = document.createElement("div");
  container.innerHTML = withBreaks;
  container.querySelectorAll("script,style,link,meta,head,title,noscript").forEach((node) => node.remove());
  return (container.textContent || "")
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function containsHtmlMarkup(value: string): boolean {
  if (!value) return false;
  return /<\/?[a-z][\s\S]*>/i.test(value);
}

export function buildIframeSrcDoc(value: string): string {
  const decoded = decodeHtmlEntities(value || "");
  if (!decoded) return "";
  if (/<html[\s>]/i.test(decoded)) return decoded;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><base target="_blank" /><style>html, body { margin: 0; padding: 0; } body { font-family: Arial, sans-serif; color: #111; background: #fff; } img { max-width: 100%; height: auto; }</style></head><body>${decoded}</body></html>`;
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value ?? "");
  }
}

export function extractFirstItemFromPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const payloadObject = payload as { items?: unknown };
  if (!Array.isArray(payloadObject.items) || payloadObject.items.length === 0) return null;
  const first = payloadObject.items[0];
  if (!first || typeof first !== "object") return null;
  return first as Record<string, unknown>;
}

export function parseImagesText(value: string): string[] {
  return value.split(/[\n,]+/g).map((item) => item.trim()).filter((item) => item.length > 0);
}

function normalizePriceForApi(raw: string): string {
  const value = raw.trim();
  if (!value) return value;
  const cleaned = value.replace(/[^\d,.\-+]/g, "");
  if (!cleaned) return "";
  const hasDot = cleaned.includes(".");
  const hasComma = cleaned.includes(",");
  if (hasDot && hasComma) return cleaned.replace(/,/g, "");
  if (hasComma && !hasDot) return cleaned.replace(/,/g, ".");
  return cleaned;
}

function normalizeForCompare(field: keyof HoodPatchForm, value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (field === "price") return normalizePriceForApi(normalized);
  if (field === "imagesText") return parseImagesText(normalized).join("\n");
  return normalized;
}

function getChangedPatchKeys(current: HoodPatchForm, initial: HoodPatchForm): string[] {
  const changed: string[] = [];
  for (const key of PATCH_FORM_FIELD_KEYS) {
    const nextValue = normalizeForCompare(key, String(current[key] ?? ""));
    const initialValue = normalizeForCompare(key, String(initial[key] ?? ""));
    if (nextValue !== initialValue) changed.push(key === "imagesText" ? "images" : key);
  }
  return Array.from(new Set(changed));
}

function buildPatchPayload(form: HoodPatchForm): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (form.title.trim()) payload.title = form.title.trim();
  if (form.description.trim()) payload.description = form.description;
  if (form.price.trim()) payload.price = normalizePriceForApi(form.price);
  if (form.quantity.trim()) {
    const parsedQuantity = Number.parseInt(form.quantity.trim(), 10);
    payload.quantity = Number.isFinite(parsedQuantity) ? parsedQuantity : form.quantity.trim();
  }
  if (form.categoryID.trim()) payload.categoryID = form.categoryID.trim();
  if (form.condition.trim()) payload.condition = form.condition.trim();
  if (form.itemMode.trim()) payload.itemMode = form.itemMode.trim();
  if (form.itemNumber.trim()) payload.itemNumber = form.itemNumber.trim();
  const images = parseImagesText(form.imagesText);
  if (images.length > 0) payload.images = images;
  return payload;
}

export function buildOutgoingPatchPayload(
  current: HoodPatchForm,
  initial: HoodPatchForm,
  explicitChangedKeys?: string[]
): {
  changedKeys: string[];
  filteredPayloadObject: Record<string, unknown>;
} {
  const payloadObject = buildPatchPayload(current);
  const changedKeys = explicitChangedKeys && explicitChangedKeys.length > 0
    ? Array.from(new Set(explicitChangedKeys))
    : getChangedPatchKeys(current, initial);
  const filteredPayloadObject: Record<string, unknown> = Object.fromEntries(
    Object.entries(payloadObject).filter(([key]) => changedKeys.includes(key))
  );

  for (const key of changedKeys) {
    if (Object.prototype.hasOwnProperty.call(filteredPayloadObject, key)) continue;
    if (["title", "description", "price", "categoryID", "condition", "itemMode", "itemNumber"].includes(key)) {
      filteredPayloadObject[key] = "";
      continue;
    }
    if (key === "quantity") {
      filteredPayloadObject[key] = null;
      continue;
    }
    if (key === "images") filteredPayloadObject[key] = [];
  }

  return { changedKeys, filteredPayloadObject };
}

export function removeUrlFromImagesText(imagesText: string, targetUrl: string): string {
  const target = targetUrl.trim();
  if (!target) return imagesText;
  const remaining = parseImagesText(imagesText).filter((url) => url !== target);
  return remaining.join("\n");
}
