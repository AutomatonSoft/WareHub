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

export type MainKauflandCreateFields = {
  size: string;
  color: string;
  material: string;
  delivery: string;
  height: string;
  length: string;
  width: string;
  amount: string;
  idOffer: string;
  storefronts: string;
};

export type MainKauflandCreateFieldKey = keyof MainKauflandCreateFields;

export type MainXljvCreateFields = {
  artikelnr: string;
  sourceSku: string;
  sourceEanField: string;
  manufacturerId: string;
  stockStatusId: string;
  taxClassId: string;
  dateAvailable: string;
  storeIds: string;
  jvUrlKey: string;
};

export type MainXljvCreateFieldKey = keyof MainXljvCreateFields;

export const DEFAULT_MAIN_KAUFLAND_CREATE_FIELDS: MainKauflandCreateFields = {
  size: "",
  color: "",
  material: "",
  delivery: "",
  height: "",
  length: "",
  width: "",
  amount: "20",
  idOffer: "",
  storefronts: "de, cz, sk, pl, at, fr, it",
};

export const DEFAULT_MAIN_XLJV_CREATE_FIELDS: MainXljvCreateFields = {
  artikelnr: "",
  sourceSku: "",
  sourceEanField: "",
  manufacturerId: "",
  stockStatusId: "",
  taxClassId: "",
  dateAvailable: "",
  storeIds: "",
  jvUrlKey: "",
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

function splitCommaOrNewlineValues(value: string): string[] {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalInteger(value: string, field: string, errors: Record<string, string>): number | undefined {
  const normalized = value.trim();
  if (!normalized) return undefined;
  if (!/^\d+$/.test(normalized)) {
    errors[field] = "This field must be a whole number.";
    return undefined;
  }
  return Number(normalized);
}

function parseIntegerList(value: string, field: string, errors: Record<string, string>): number[] {
  const values = splitCommaOrNewlineValues(value);
  const parsed = values.map((item) => Number(item));
  if (parsed.some((item) => !Number.isInteger(item) || item < 0)) {
    errors[field] = "Use comma-separated whole numbers.";
    return [];
  }
  return [...new Set(parsed)];
}

export function validateMainXljvCreateFields(
  fields: MainXljvCreateFields,
): Partial<Record<MainXljvCreateFieldKey, string>> {
  const errors: Record<string, string> = {};
  parseOptionalInteger(fields.manufacturerId, "manufacturerId", errors);
  parseOptionalInteger(fields.stockStatusId, "stockStatusId", errors);
  parseOptionalInteger(fields.taxClassId, "taxClassId", errors);
  parseIntegerList(fields.storeIds, "storeIds", errors);
  if (fields.dateAvailable.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(fields.dateAvailable.trim())) {
    errors.dateAvailable = "Use YYYY-MM-DD.";
  }
  return errors as Partial<Record<MainXljvCreateFieldKey, string>>;
}

export function buildMainXljvCreatePayload(input: {
  ean: string;
  fields: MainXljvCreateFields;
}): Record<string, unknown> {
  const errors: Record<string, string> = {};
  const { ean, fields } = input;
  const storeIds = parseIntegerList(fields.storeIds, "storeIds", errors);
  const manufacturerId = parseOptionalInteger(fields.manufacturerId, "manufacturerId", errors);
  const stockStatusId = parseOptionalInteger(fields.stockStatusId, "stockStatusId", errors);
  const taxClassId = parseOptionalInteger(fields.taxClassId, "taxClassId", errors);

  return {
    source_model: fields.artikelnr.trim() || ean,
    source_sku: fields.sourceSku.trim(),
    source_ean_field: fields.sourceEanField.trim() || ean,
    ...(manufacturerId !== undefined ? { manufacturer_id: manufacturerId } : {}),
    ...(stockStatusId !== undefined ? { stock_status_id: stockStatusId } : {}),
    ...(taxClassId !== undefined ? { tax_class_id: taxClassId } : {}),
    ...(fields.dateAvailable.trim() ? { date_available: fields.dateAvailable.trim() } : {}),
    ...(storeIds.length > 0 ? { stores: storeIds.map((storeId) => ({ store_id: storeId })) } : {}),
    jv_fields: {
      artikelnr: fields.artikelnr.trim() || ean,
      ...(fields.sourceSku.trim() ? { jfsku: fields.sourceSku.trim() } : {}),
      ean: fields.sourceEanField.trim() || ean,
      ...(fields.jvUrlKey.trim() ? { urlkey: fields.jvUrlKey.trim() } : {}),
      is_sofort: 1,
    },
  };
}

export function validateMainKauflandCreateFields(
  fields: MainKauflandCreateFields,
): Partial<Record<MainKauflandCreateFieldKey, string>> {
  const errors: Partial<Record<MainKauflandCreateFieldKey, string>> = {};
  const required: MainKauflandCreateFieldKey[] = [
    "size", "color", "material", "delivery", "height", "length", "width",
  ];
  for (const field of required) {
    if (!fields[field].trim()) errors[field] = "This field is required for Kaufland.";
  }
  if (fields.delivery.trim() && !/^\d+$/.test(fields.delivery.trim())) {
    errors.delivery = "Delivery must be a whole number.";
  }
  if (fields.amount.trim() && (!/^\d+$/.test(fields.amount.trim()) || Number(fields.amount) < 1)) {
    errors.amount = "Amount must be a positive whole number.";
  }
  for (const field of ["height", "length", "width"] as const) {
    if (fields[field].trim() && !/^\d+(?:\.\d+)?$/.test(fields[field].trim())) {
      errors[field] = "This field must be a decimal number.";
    }
  }
  if (splitCommaOrNewlineValues(fields.storefronts).length === 0) {
    errors.storefronts = "At least one storefront is required.";
  }
  return errors;
}

export function buildMainKauflandCreatePayload(input: {
  ean: string;
  imageUrls: string[];
  description: string;
  fields: MainKauflandCreateFields;
}): Record<string, unknown> {
  const { ean, imageUrls, description, fields } = input;
  return {
    description: description.trim(),
    picture: imageUrls,
    size: fields.size.trim(),
    color: fields.color.trim(),
    material: fields.material.trim(),
    delivery: Number(fields.delivery),
    height: fields.height.trim(),
    length: fields.length.trim(),
    width: fields.width.trim(),
    amount: Number(fields.amount || "20"),
    id_offer: fields.idOffer.trim() || ean,
    storefronts: splitCommaOrNewlineValues(fields.storefronts),
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
