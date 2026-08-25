function text(value) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
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
