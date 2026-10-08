function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

export const OTTO_PRODUCT_LINE_MAX_LENGTH = 70;

export const OTTO_BASE_COLORS = Object.freeze([
  "beige", "blau", "braun", "bunt", "gelb", "goldfarben", "grau", "grün",
  "lila", "natur", "orange", "rosa", "rot", "schwarz", "silberfarben", "transparent", "weiß",
]);

export function isOttoProductLineValid(value) {
  return text(value).length <= OTTO_PRODUCT_LINE_MAX_LENGTH;
}

function values(value) {
  if (Array.isArray(value)) return value.flatMap(values).filter(Boolean);
  if (value && typeof value === "object") {
    return values(value.values ?? value.value ?? value.selectedValues ?? value.attributeValue);
  }
  const normalized = text(value);
  return normalized ? [normalized] : [];
}

export function normalizeOttoProductAttributes(value) {
  if (Array.isArray(value)) {
    return value.flatMap((attribute, index) => {
      if (!attribute || typeof attribute !== "object") return [];
      const id = text(attribute.attributeId ?? attribute.attributeKey ?? attribute.id) || String(index);
      const label = text(attribute.name ?? attribute.label ?? attribute.attributeKey ?? attribute.attributeId) || id;
      const attributeValues = values(attribute.values ?? attribute.value ?? attribute.selectedValues ?? attribute.attributeValue);
      return attributeValues.length ? [{ id, label, values: attributeValues }] : [];
    });
  }

  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([id, selectedValue]) => {
    const attributeValues = values(selectedValue);
    return attributeValues.length ? [{ id, label: id, values: attributeValues }] : [];
  });
}

export function applyOttoAttributeSuggestions(draft, productAttributes, suggestions) {
  const source = normalizeOttoProductAttributes(productAttributes);
  const next = { ...draft, additionalAttributes: { ...draft.additionalAttributes }, attributeOverrides: { ...draft.attributeOverrides }, attributeNames: { ...draft.attributeNames } };
  let applied = 0;
  for (const suggestion of suggestions) {
    const name = text(suggestion.name);
    const value = text(suggestion.value);
    const id = text(suggestion.id);
    if (!name || !value || !id) continue;
    const existing = source.find((attribute) => attribute.id === id || attribute.label.toLocaleLowerCase() === name.toLocaleLowerCase());
    const targetId = existing?.id ?? id;
    if (draft.removedAttributeIds.includes(targetId) || draft.removedAttributeIds.includes(id)) continue;
    if (existing && text(next.attributeOverrides[targetId] ?? existing.values.join(", "))) continue;
    if (text(next.additionalAttributes[targetId]) || text(next.attributeOverrides[targetId])) continue;
    const sameName = Object.entries(next.attributeNames).some(([key, label]) => text(label).toLocaleLowerCase() === name.toLocaleLowerCase() && text(next.additionalAttributes[key] ?? next.attributeOverrides[key]));
    if (sameName) continue;
    if (existing) next.attributeOverrides[targetId] = value;
    else next.additionalAttributes[targetId] = value;
    next.attributeNames[targetId] = name;
    applied += 1;
  }
  return { draft: next, applied };
}

export function applyOttoDefaultAttributes(draft, productAttributes, attributes) {
  const source = normalizeOttoProductAttributes(productAttributes);
  let next = draft;
  for (const attribute of attributes) {
    if (!attribute.defaultValue && attribute.relevance !== "HIGH") continue;
    const existing = source.find((item) => item.id === attribute.id || item.label.toLocaleLowerCase() === attribute.name.toLocaleLowerCase());
    if (existing && !attribute.defaultValue) continue;
    const id = existing?.id ?? attribute.id;
    if (draft.removedAttributeIds.includes(id) || draft.removedAttributeIds.includes(attribute.id)) continue;
    if (id in next.attributeOverrides || id in next.additionalAttributes) continue;
    if (Object.entries(next.attributeNames).some(([key, name]) => name.toLocaleLowerCase() === attribute.name.toLocaleLowerCase() && (key in next.attributeOverrides || key in next.additionalAttributes))) continue;
    next = {
      ...next,
      attributeNames: { ...next.attributeNames, [id]: attribute.name },
      ...(existing
        ? { attributeOverrides: { ...next.attributeOverrides, [id]: attribute.defaultValue } }
        : { additionalAttributes: { ...next.additionalAttributes, [id]: attribute.defaultValue ?? "" } }),
    };
  }
  return next;
}

export function buildOttoPayloadAttributes({ productAttributes, additionalAttributes, attributeOverrides, attributeNames, removedAttributeIds }) {
  const removedIds = new Set(removedAttributeIds ?? []);
  const attributesByName = new Map();

  for (const attribute of normalizeOttoProductAttributes(productAttributes)) {
    if (removedIds.has(attribute.id)) continue;
    const override = text(attributeOverrides?.[attribute.id]);
    const name = text(attributeNames?.[attribute.id]) || attribute.label;
    const key = name.toLocaleLowerCase();
    if (!name || !key) continue;
    attributesByName.set(key, { name, values: override ? [override] : attribute.values });
  }

  for (const [attributeId, value] of Object.entries(additionalAttributes ?? {})) {
    if (removedIds.has(attributeId)) continue;
    const name = text(attributeNames?.[attributeId]);
    const normalizedValue = text(value);
    if (!name || !normalizedValue) continue;
    attributesByName.set(name.toLocaleLowerCase(), { name, values: [normalizedValue] });
  }

  return Array.from(attributesByName.values());
}

export function extractOttoMediaUrls(product) {
  if (!product || typeof product !== "object") return [];
  const assets = Array.isArray(product.mediaAssets) ? product.mediaAssets : [];
  const urls = assets.flatMap((asset) => {
    if (!asset || typeof asset !== "object") return [];
    const location = text(asset.location ?? asset.publicUrl ?? asset.public_url ?? asset.url ?? asset.src);
    return location ? [location] : [];
  });
  const imageUrl = text(product.imageUrl ?? product.ottoImageUrl ?? product.otto_image_url);
  if (imageUrl) urls.unshift(imageUrl);
  return Array.from(new Set(urls));
}

export function applyReservedOttoIdentity(draft, reservedEan) {
  const ean = text(reservedEan);
  return ean ? { ...draft, sku: ean, ean } : draft;
}
