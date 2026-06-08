export function createEmptyHoodDraft() {
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

export function createEmptyJvDraft() {
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
    descriptions: [],
    categories: [],
    images: [],
    jv_fields: {}
  };
}

export function hydrateHoodDraft(input, loadDraft) {
  if (!loadDraft) return createEmptyHoodDraft();
  return {
    ...loadDraft,
    productProperties: normalizeHoodProperties(loadDraft.productProperties),
    target_id: loadDraft.target_id || input?.id || "",
    quantity: loadDraft.quantity == null ? "" : String(loadDraft.quantity),
    pending_uploads: []
  };
}

export function countFoundTargets(groups) {
  return (groups ?? []).flatMap((group) => group.targets).filter((target) => target.status === "found").length;
}

export function getGroupStatusCopy(group) {
  if (!group) return "Waiting for search";
  if (group.unsupported) return "Unsupported";
  if (group.planned) return "Planned";
  if (group.read_only) return "Read-only";
  return "Active";
}

export function buildHoodChangedFields(initial, current) {
  const changed = new Set();
  const scalarKeys = [
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

export function buildJvChangedFields(initial, current) {
  const changed = new Set();
  const scalarKeys = ["source_model", "source_sku", "source_ean_field", "price", "quantity", "image"];
  for (const key of scalarKeys) {
    const nextValue = normalizeScalar(String(current[key] ?? ""));
    const initialValue = normalizeScalar(String(initial[key] ?? ""));
    if (nextValue !== initialValue) changed.add(String(key));
  }
  if (Boolean(current.status) !== Boolean(initial.status)) changed.add("status");
  if (JSON.stringify(current.descriptions) !== JSON.stringify(initial.descriptions)) changed.add("descriptions");
  if (JSON.stringify(current.categories) !== JSON.stringify(initial.categories)) changed.add("categories");
  if (JSON.stringify(current.images) !== JSON.stringify(initial.images)) changed.add("images");
  if (JSON.stringify(current.jv_fields) !== JSON.stringify(initial.jv_fields)) changed.add("jv_fields");
  return Array.from(changed);
}

export function containsTechnicalDescriptionHtml(value) {
  return /<(meta|link|style|script|html|head|body)\b/i.test(value);
}

export function sanitizeDescriptionPreviewHtml(value) {
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

export function normalizeProductAttributes(input) {
  if (!input) return [];
  if (Array.isArray(input)) {
    return input.map((row, index) => mapAttributeRow(row, index)).filter(Boolean);
  }
  if (typeof input === "object") {
    return Object.entries(input).map(([key, value]) => ({
      key,
      label: toReadableLabel(key),
      value: stringifyAttributeValue(value)
    }));
  }
  return [];
}

export function attributesToProductProperties(attributes) {
  return attributes
    .map((row) => ({ name: row.key, value: row.value }))
    .filter((row) => String(row.name).trim() !== "");
}

export function normalizeHoodProperties(input) {
  if (!Array.isArray(input)) return [];
  return input
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const name = String(row.name ?? row.key ?? "").trim();
      const value = stringifyAttributeValue(row.value ?? row.val ?? "");
      if (!name) return null;
      return { name, value };
    })
    .filter(Boolean);
}

export function getGalleryMainImage(images, selectedImage) {
  if (selectedImage && images.includes(selectedImage)) return selectedImage;
  return images[0] ?? "";
}

function mapAttributeRow(row, index) {
  if (!row || typeof row !== "object") return null;
  const keyRaw = row.name ?? row.key ?? row.label ?? `attribute_${index + 1}`;
  const key = String(keyRaw).trim();
  if (!key) return null;
  const value = stringifyAttributeValue(row.value ?? row.val ?? row.content ?? "");
  return {
    key,
    label: typeof row.name === "string" ? row.name : toReadableLabel(key),
    value
  };
}

function stringifyAttributeValue(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function toReadableLabel(key) {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function normalizeScalar(value) {
  return value.replace(/\r\n/g, "\n").trim();
}

function joinImages(value) {
  return value.map((item) => item.trim()).filter(Boolean).join("\n");
}
