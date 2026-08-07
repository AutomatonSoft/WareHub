export function parseImageUrlsFromText(imagesText) {
  return String(imagesText || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validateCreateProductInput(input) {
  const errors = {};
  const price = String(input?.price || "").trim();
  const productName = String(input?.productName || "").trim();

  if (!/^\d+([.,]\d{1,2})?$/.test(price)) {
    errors.price = "price_numeric";
  }
  if (productName.length < 3) {
    errors.productName = "product_name_min_3";
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

export function normalizeCreateProductInput(input) {
  return {
    ean: String(input?.ean || "").trim(),
    price: String(input?.price || "").trim().replace(",", "."),
    productName: String(input?.productName || "").trim(),
    imageUrls: parseImageUrlsFromText(input?.imagesText || "")
  };
}

export const DEFAULT_HOOD_CREATE_FIELDS = {
  description: "",
  quantity: "1",
  condition: "new",
  itemMode: "shopProduct",
  itemNumber: "",
  productPropertiesText: "[]"
};

export const HOOD_CREATE_CATEGORY_ID = "2412";

export function validateHoodCreateFields(fields) {
  const errors = {};
  if (!fields.description.trim()) errors.description = "Description is required for Hood.";
  if (!/^\d+$/.test(fields.quantity.trim()) || Number(fields.quantity) < 1) {
    errors.quantity = "Quantity must be a positive whole number.";
  }
  try {
    const parsed = JSON.parse(fields.productPropertiesText || "[]");
    if (!Array.isArray(parsed) || parsed.some((item) => !item || typeof item !== "object")) {
      errors.productPropertiesText = "Properties must be a JSON array of name/value objects.";
    }
  } catch {
    errors.productPropertiesText = "Properties must be valid JSON.";
  }
  return errors;
}

export function buildHoodCreatePayload(input) {
  const productProperties = JSON.parse(input.fields.productPropertiesText || "[]");
  return {
    description: input.fields.description.trim(),
    quantity: Number(input.fields.quantity),
    categoryID: HOOD_CREATE_CATEGORY_ID,
    condition: input.fields.condition.trim(),
    itemMode: input.fields.itemMode.trim(),
    itemNumber: input.fields.itemNumber.trim() || input.ean,
    productProperties: productProperties
      .map((property) => ({ name: String(property?.name || "").trim(), value: String(property?.value || "").trim() }))
      .filter((property) => property.name && property.value)
  };
}
