"use client";

import type {
  ProductEditorDiscoverResponse,
  ProductEditorGroup,
  ProductEditorGroupId,
  ProductEditorHoodDraft,
  ProductEditorHoodProperty,
  ProductEditorJvDraft,
  ProductEditorPendingUpload,
  ProductEditorTarget,
  ProductEditorTargetStatus
} from "./product-editor-types";

export const PRODUCT_EDITOR_TAB_ORDER: ProductEditorGroupId[] = ["JV", "XL", "HOOD", "OTTO", "KAUFLAND", "EBAY"];

export function createEmptyHoodDraft(): ProductEditorHoodDraft {
  return {
    target_id: "",
    account: "jv",
    ean: "",
    item_id: "",
    title: "",
    description: "",
    price: "",
    quantity: "",
    categoryID: "",
    condition: "",
    itemMode: "",
    itemNumber: "",
    image: "",
    images: [],
    productProperties: [],
    raw_payload: {},
    pending_uploads: []
  };
}

export function createEmptyJvDraft(): ProductEditorJvDraft {
  return {
    target_id: "",
    ean: "",
    source_model: "",
    source_sku: "",
    source_ean_field: "",
    price: "",
    quantity: "",
    status: false,
    image: "",
    image_public_url: "",
    descriptions: [],
    categories: [],
    categories_by_site_key: {},
    images: [],
    jv_fields: {},
    jv_fields_by_site_key: {},
    pending_uploads: []
  };
}

export function hydrateHoodDraft(
  input: ProductEditorTarget | null,
  loadDraft?: {
    target_id: string;
    account: "jv" | "xl";
    ean: string;
    item_id: string;
    title: string;
    description: string;
    price: string;
    quantity: number | null;
    categoryID: string;
    condition: string;
    itemMode: string;
    itemNumber: string;
    image: string;
    images: string[];
    productProperties: ProductEditorHoodProperty[];
    raw_payload: Record<string, unknown>;
  }
): ProductEditorHoodDraft {
  if (!loadDraft) return createEmptyHoodDraft();
  return {
    ...loadDraft,
    productProperties: normalizeHoodProperties(loadDraft.productProperties),
    target_id: loadDraft.target_id || input?.id || "",
    quantity: loadDraft.quantity == null ? "" : String(loadDraft.quantity),
    pending_uploads: []
  };
}

export function hydrateJvDraft(input?: {
  target_id: string;
  ean: string;
  source_model: string;
  source_sku: string;
  source_ean_field: string;
  price: string;
  quantity: number | null;
  status: boolean;
  image: string;
  image_public_url?: string;
  descriptions: Array<Record<string, unknown>>;
  categories: Array<Record<string, unknown>>;
  categories_by_site_key?: Record<string, unknown>;
  images: Array<Record<string, unknown>>;
  jv_fields: Record<string, unknown>;
  jv_fields_by_site_key?: Record<string, unknown>;
}): ProductEditorJvDraft {
  if (!input) return createEmptyJvDraft();
  return {
    target_id: input.target_id || "",
    ean: input.ean || "",
    source_model: input.source_model || "",
    source_sku: input.source_sku || "",
    source_ean_field: input.source_ean_field || "",
    price: input.price || "",
    quantity: input.quantity == null ? "" : String(input.quantity),
    status: Boolean(input.status),
    image: input.image || "",
    image_public_url: String(input.image_public_url ?? ""),
    descriptions: Array.isArray(input.descriptions)
      ? input.descriptions.map((row) => ({
          language_id: Number(row.language_id ?? 1),
          name: String(row.name ?? ""),
          description: String(row.description ?? ""),
          tag: String(row.tag ?? ""),
          meta_title: String(row.meta_title ?? ""),
          meta_description: String(row.meta_description ?? ""),
          meta_keyword: String(row.meta_keyword ?? "")
        }))
      : [],
    categories: Array.isArray(input.categories)
      ? input.categories.map((row) => ({
          category_id: Number(row.category_id ?? 0),
          main_category: Boolean(row.main_category)
        })).filter((row) => row.category_id > 0)
      : [],
    categories_by_site_key: normalizeCategoriesBySiteKey(input.categories_by_site_key),
    images: Array.isArray(input.images)
      ? input.images.map((row) => ({
          image: String(row.image ?? ""),
          public_url: String(row.public_url ?? ""),
          sort_order: Number(row.sort_order ?? 0)
        })).filter((row) => row.image.trim() !== "")
      : [],
    jv_fields: input.jv_fields ?? {},
    jv_fields_by_site_key: normalizeFieldsBySiteKey(input.jv_fields_by_site_key),
    pending_uploads: []
  };
}

export function findGroup(discover: ProductEditorDiscoverResponse | null, groupId: ProductEditorGroupId): ProductEditorGroup | null {
  return discover?.groups.find((group) => group.id === groupId) ?? null;
}

export function findTarget(group: ProductEditorGroup | null, targetId: string | null | undefined): ProductEditorTarget | null {
  if (!group || !targetId) return null;
  return group.targets.find((target) => target.id === targetId) ?? null;
}

export function countFoundTargets(groups: ProductEditorGroup[] | null | undefined): number {
  return (groups ?? []).flatMap((group) => group.targets).filter((target) => target.status === "found").length;
}

export function getGroupStatusCopy(group: ProductEditorGroup | null): string {
  if (!group) return "Waiting for search";
  if (group.unsupported) return "Unsupported";
  if (group.planned) return "Planned";
  if (group.read_only) return "Read-only";
  return "Active";
}

export function getTargetStatusLabel(status: ProductEditorTargetStatus): string {
  switch (status) {
    case "found":
      return "Found";
    case "missing":
      return "Missing";
    case "error":
      return "Error";
    case "planned":
      return "Planned";
    case "unsupported":
      return "Unsupported";
    case "read_only":
      return "Read-only";
    default:
      return "Unknown";
  }
}

export function buildHoodChangedFields(initial: ProductEditorHoodDraft, current: ProductEditorHoodDraft): string[] {
  const changed = new Set<string>();
  const scalarKeys: Array<keyof ProductEditorHoodDraft> = [
    "title",
    "description",
    "price",
    "quantity",
    "categoryID",
    "condition",
    "itemMode",
    "itemNumber"
  ];
  for (const key of scalarKeys) {
    const nextValue = normalizeScalar(String(current[key] ?? ""));
    const initialValue = normalizeScalar(String(initial[key] ?? ""));
    if (nextValue !== initialValue) changed.add(String(key));
  }
  if (joinImages(initial.images) !== joinImages(current.images)) {
    changed.add("images");
  }
  if (JSON.stringify(initial.productProperties ?? []) !== JSON.stringify(current.productProperties ?? [])) {
    changed.add("productProperties");
  }
  return Array.from(changed);
}

export function buildJvChangedFields(initial: ProductEditorJvDraft, current: ProductEditorJvDraft): string[] {
  const changed = new Set<string>();
  const scalarKeys: Array<keyof ProductEditorJvDraft> = [
    "source_model",
    "source_sku",
    "source_ean_field",
    "price",
    "quantity",
    "image"
  ];
  for (const key of scalarKeys) {
    if (normalizeScalar(String(current[key] ?? "")) !== normalizeScalar(String(initial[key] ?? ""))) {
      changed.add(String(key));
    }
  }
  if (Boolean(current.status) !== Boolean(initial.status)) {
    changed.add("status");
  }
  if (JSON.stringify(current.descriptions) !== JSON.stringify(initial.descriptions)) {
    changed.add("descriptions");
  }
  if (JSON.stringify(current.categories) !== JSON.stringify(initial.categories)) {
    changed.add("categories");
  }
  if (JSON.stringify(current.categories_by_site_key) !== JSON.stringify(initial.categories_by_site_key)) {
    changed.add("categories");
  }
  if (JSON.stringify(current.images) !== JSON.stringify(initial.images)) {
    changed.add("images");
  }
  if (JSON.stringify(current.jv_fields) !== JSON.stringify(initial.jv_fields)) {
    changed.add("jv_fields");
  }
  if (JSON.stringify(current.jv_fields_by_site_key) !== JSON.stringify(initial.jv_fields_by_site_key)) {
    changed.add("jv_fields");
  }
  return Array.from(changed);
}

function normalizeCategoriesBySiteKey(input: Record<string, unknown> | undefined): ProductEditorJvDraft["categories_by_site_key"] {
  const normalized: ProductEditorJvDraft["categories_by_site_key"] = {};
  if (!input) return normalized;
  for (const [rawSiteKey, rawRows] of Object.entries(input)) {
    const siteKey = String(rawSiteKey || "").trim().toUpperCase();
    if (!siteKey || !Array.isArray(rawRows)) continue;
    const rows = rawRows
      .map((row) => {
        const item = row as Record<string, unknown>;
        const categoryId = Number(item.category_id ?? 0);
        if (!Number.isFinite(categoryId) || categoryId <= 0) return null;
        return {
          category_id: categoryId,
          main_category: Boolean(item.main_category)
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row));
    if (rows.length > 0) {
      normalized[siteKey as keyof ProductEditorJvDraft["categories_by_site_key"]] = rows;
    }
  }
  return normalized;
}

function normalizeFieldsBySiteKey(input: Record<string, unknown> | undefined): ProductEditorJvDraft["jv_fields_by_site_key"] {
  const normalized: ProductEditorJvDraft["jv_fields_by_site_key"] = {};
  if (!input) return normalized;
  for (const [rawSiteKey, rawValue] of Object.entries(input)) {
    const siteKey = String(rawSiteKey || "").trim().toUpperCase();
    if (!siteKey || !rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) continue;
    normalized[siteKey as keyof ProductEditorJvDraft["jv_fields_by_site_key"]] = { ...(rawValue as Record<string, unknown>) };
  }
  return normalized;
}

export function addPendingUploads(
  current: ProductEditorPendingUpload[],
  files: FileList | null
): ProductEditorPendingUpload[] {
  if (!files || files.length === 0) return current;
  const existingNames = new Set(current.map((item) => `${item.name}-${item.size}`));
  const nextItems = [...current];
  Array.from(files).forEach((file) => {
    const signature = `${file.name}-${file.size}`;
    if (existingNames.has(signature)) return;
    nextItems.push({
      id: `${file.name}-${file.size}-${Date.now()}-${nextItems.length}`,
      name: file.name,
      size: file.size,
      type: file.type,
      file
    });
    existingNames.add(signature);
  });
  return nextItems;
}

export function formatFileSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.round(size / 1024)} KB`;
  return `${size} B`;
}

export function hasActionableHoodTarget(group: ProductEditorGroup | null): boolean {
  return Boolean(group?.targets.some((target) => target.status === "found" && target.capabilities.load));
}

export function hasActionableJvTarget(group: ProductEditorGroup | null): boolean {
  return Boolean(group?.targets.some((target) => target.status === "found" && target.capabilities.load));
}

export function containsTechnicalDescriptionHtml(value: string): boolean {
  return /<(meta|link|style|script|html|head|body)\b/i.test(value);
}

export function sanitizeDescriptionPreviewHtml(value: string): string {
  if (!value) return "";
  const sanitized = value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<meta\b[^>]*\/?>/gi, "")
    .replace(/<link\b[^>]*\/?>/gi, "")
    .replace(/<\/?(html|body)\b[^>]*>/gi, "")
    .trim();
  if (sanitized.length > 120000) return sanitized.slice(0, 120000);
  return sanitized;
}

export type ProductEditorAttributeField = { key: string; label: string; value: string };

export function normalizeProductAttributes(input: unknown): ProductEditorAttributeField[] {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((row, index) => mapAttributeRow(row, index)).filter((row): row is ProductEditorAttributeField => Boolean(row));
  }
  if (typeof input === "object") {
    return Object.entries(input as Record<string, unknown>).map(([key, value]) => ({
      key,
      label: toReadableLabel(key),
      value: stringifyAttributeValue(value)
    }));
  }
  return [];
}

export function attributesToProductProperties(attributes: ProductEditorAttributeField[]): Array<Record<string, unknown>> {
  return attributes
    .map((row) => ({ name: row.key, value: row.value }))
    .filter((row) => String(row.name).trim() !== "");
}

export function normalizeHoodProperties(input: unknown): ProductEditorHoodProperty[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const source = row as Record<string, unknown>;
      const name = String(source.name ?? source.key ?? "").trim();
      const value = stringifyAttributeValue(source.value ?? source.val ?? "");
      if (!name) return null;
      return { name, value };
    })
    .filter((row): row is ProductEditorHoodProperty => Boolean(row));
}

export function getGalleryMainImage(images: string[], selectedImage?: string | null): string {
  if (selectedImage && images.includes(selectedImage)) return selectedImage;
  return images[0] ?? "";
}

function mapAttributeRow(row: unknown, index: number): ProductEditorAttributeField | null {
  if (!row || typeof row !== "object") return null;
  const source = row as Record<string, unknown>;
  const keyRaw = source.name ?? source.key ?? source.label ?? `attribute_${index + 1}`;
  const key = String(keyRaw).trim();
  if (!key) return null;
  const value = stringifyAttributeValue(source.value ?? source.val ?? source.content ?? "");
  return {
    key,
    label: typeof source.name === "string" ? source.name : toReadableLabel(key),
    value
  };
}

function stringifyAttributeValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function toReadableLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeScalar(value: string): string {
  return value.replace(/\r\n/g, "\n").trim();
}

function joinImages(value: string[]): string {
  return value.map((item) => item.trim()).filter(Boolean).join("\n");
}
