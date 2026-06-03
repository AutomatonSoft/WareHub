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
