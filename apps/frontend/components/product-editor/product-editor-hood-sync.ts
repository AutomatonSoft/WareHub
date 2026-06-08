import type {
  ProductEditorHoodDraft,
  ProductEditorHoodProperty,
  ProductEditorPendingUpload
} from "./product-editor-types";

type HoodApiItem = Record<string, unknown>;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function normalizeImageList(item: HoodApiItem): string[] {
  const rawImages = Array.isArray(item.images) ? item.images : [];
  const image = normalizeString(item.image).trim();
  const result: string[] = [];
  const seen = new Set<string>();

  for (const raw of [image, ...rawImages.map((entry) => normalizeString(entry))]) {
    const value = raw.trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }

  return result;
}

function normalizeProperties(raw: unknown): ProductEditorHoodProperty[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const item = entry as Record<string, unknown>;
      const name = normalizeString(item.name ?? item.key).trim();
      if (!name) return null;
      return {
        name,
        value: normalizeString(item.value ?? item.val).trim()
      };
    })
    .filter((entry): entry is ProductEditorHoodProperty => Boolean(entry));
}

export function buildHoodDraftFromApiItem(params: {
  account: "jv" | "xl";
  ean: string;
  item: unknown;
  targetId: string;
  rawPayload: Record<string, unknown>;
}): ProductEditorHoodDraft | null {
  if (!params.item || typeof params.item !== "object") return null;
  const item = params.item as HoodApiItem;
  const images = normalizeImageList(item);

  return {
    target_id: params.targetId,
    account: params.account,
    ean: normalizeString(item.ean).trim() || params.ean.trim(),
    item_id: normalizeString(item.item_id ?? item.itemId).trim(),
    title: normalizeString(item.title),
    description: normalizeString(item.description),
    price: normalizeString(item.price),
    quantity: normalizeString(item.quantity),
    categoryID: normalizeString(item.categoryID),
    condition: normalizeString(item.condition),
    itemMode: normalizeString(item.itemMode),
    itemNumber: normalizeString(item.itemNumber),
    image: images[0] ?? "",
    images,
    productProperties: normalizeProperties(item.productProperties),
    raw_payload: params.rawPayload,
    pending_uploads: []
  };
}

export function buildHoodPatchPayloadFromDraft(
  draft: ProductEditorHoodDraft,
  changedFields: string[]
): { changedKeys: string[]; payloadObject: Record<string, unknown> } {
  const changedKeys = Array.from(new Set(changedFields));
  const payloadObject: Record<string, unknown> = {};

  for (const key of changedKeys) {
    if (key === "title") payloadObject.title = draft.title.trim();
    if (key === "description") payloadObject.description = draft.description;
    if (key === "price") payloadObject.price = draft.price.trim();
    if (key === "quantity") {
      const value = draft.quantity.trim();
      payloadObject.quantity = value ? Number.parseInt(value, 10) || value : null;
    }
    if (key === "categoryID") payloadObject.categoryID = draft.categoryID.trim();
    if (key === "condition") payloadObject.condition = draft.condition.trim();
    if (key === "itemMode") payloadObject.itemMode = draft.itemMode.trim();
    if (key === "itemNumber") payloadObject.itemNumber = draft.itemNumber.trim();
    if (key === "images") {
      payloadObject.images = draft.images.map((item) => item.trim()).filter(Boolean);
    }
    if (key === "productProperties") {
      payloadObject.productProperties = draft.productProperties
        .map((item) => ({ name: item.name.trim(), value: item.value }))
        .filter((item) => item.name);
    }
  }

  return { changedKeys, payloadObject };
}

export function mergeHoodImageUrls(
  current: string[],
  incoming: string[],
  role: "main" | "additional"
): string[] {
  const normalizedCurrent = current.map((item) => item.trim()).filter(Boolean);
  const normalizedIncoming = incoming.map((item) => item.trim()).filter(Boolean);
  const ordered = role === "main" ? [...normalizedIncoming, ...normalizedCurrent] : [...normalizedCurrent, ...normalizedIncoming];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const url of ordered) {
    if (!url || seen.has(url)) continue;
    seen.add(url);
    result.push(url);
  }
  return result;
}

export function setHoodMainImage(current: string[], imageUrl: string): string[] {
  const target = imageUrl.trim();
  if (!target) return current.map((item) => item.trim()).filter(Boolean);
  return mergeHoodImageUrls(current.filter((item) => item.trim() !== target), [target], "main");
}

export function reorderHoodImages(current: string[], sourceImageUrl: string, targetImageUrl: string): string[] {
  const normalized = current.map((item) => item.trim()).filter(Boolean);
  const source = sourceImageUrl.trim();
  const target = targetImageUrl.trim();
  if (!source || !target || source === target) return normalized;

  const sourceIndex = normalized.findIndex((item) => item === source);
  const targetIndex = normalized.findIndex((item) => item === target);
  if (sourceIndex === -1 || targetIndex === -1) return normalized;

  const next = [...normalized];
  const [moved] = next.splice(sourceIndex, 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

export function removeHoodImage(current: string[], imageUrl: string): string[] {
  const target = imageUrl.trim();
  if (!target) return current.map((item) => item.trim()).filter(Boolean);
  return current.map((item) => item.trim()).filter((item) => item && item !== target);
}

export function extractPendingUploadFiles(pendingUploads: ProductEditorPendingUpload[]): File[] {
  return pendingUploads
    .map((item) => item.file)
    .filter((item): item is File => typeof File !== "undefined" && item instanceof File);
}
