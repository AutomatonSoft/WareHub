export type CreateProductFormInput = {
  ean: string;
  price: string;
  productName: string;
  imagesText: string;
};

export type CreateProductFieldKey = "ean" | "price" | "productName";
export type CreateProductValidationErrorCode =
  | "ean_exactly_13_digits"
  | "price_numeric"
  | "product_name_min_3";

export type CreateProductValidationResult = {
  isValid: boolean;
  errors: Partial<Record<CreateProductFieldKey, CreateProductValidationErrorCode>>;
};

export type NormalizedCreateProductInput = {
  ean: string;
  price: string;
  productName: string;
  imageUrls: string[];
};

export type HoodCreateFields = {
  description: string;
  quantity: string;
  condition: string;
  itemMode: string;
  itemNumber: string;
  productPropertiesText: string;
};

export const HOOD_CREATE_CATEGORY_ID = "2412";

export type HoodCreateFieldKey = keyof HoodCreateFields;

export type HoodProductProperty = {
  name: string;
  value: string;
};

export const DEFAULT_HOOD_CREATE_FIELDS: HoodCreateFields = {
  description: "",
  quantity: "1",
  condition: "new",
  itemMode: "shopProduct",
  itemNumber: "",
  productPropertiesText: "[]"
};

export function validateHoodCreateFields(
  fields: HoodCreateFields
): Partial<Record<HoodCreateFieldKey, string>> {
  const errors: Partial<Record<HoodCreateFieldKey, string>> = {};

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

export function buildHoodCreatePayload(input: {
  ean: string;
  fields: HoodCreateFields;
}): Record<string, unknown> {
  const productProperties = JSON.parse(input.fields.productPropertiesText || "[]") as HoodProductProperty[];

  return {
    description: input.fields.description.trim(),
    quantity: Number(input.fields.quantity),
    categoryID: HOOD_CREATE_CATEGORY_ID,
    condition: input.fields.condition.trim(),
    itemMode: input.fields.itemMode.trim(),
    itemNumber: input.fields.itemNumber.trim() || input.ean,
    productProperties: productProperties
      .map((property) => ({
        name: String(property?.name || "").trim(),
        value: String(property?.value || "").trim()
      }))
      .filter((property) => property.name && property.value)
  };
}

export function parseImageUrlsFromText(imagesText: string): string[] {
  return imagesText
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validateCreateProductInput(input: CreateProductFormInput): CreateProductValidationResult {
  const errors: Partial<Record<CreateProductFieldKey, CreateProductValidationErrorCode>> = {};
  const ean = input.ean.trim();
  const price = input.price.trim();
  const productName = input.productName.trim();

  if (!/^\d{13}$/.test(ean)) {
    errors.ean = "ean_exactly_13_digits";
  }
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

export function normalizeCreateProductInput(input: CreateProductFormInput): NormalizedCreateProductInput {
  return {
    ean: input.ean.trim(),
    price: input.price.trim().replace(",", "."),
    productName: input.productName.trim(),
    imageUrls: parseImageUrlsFromText(input.imagesText)
  };
}
