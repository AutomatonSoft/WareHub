export function parseImageUrlsFromText(imagesText) {
  return String(imagesText || "")
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean);
}

export function validateCreateProductInput(input) {
  const errors = {};
  const ean = String(input?.ean || "").trim();
  const price = String(input?.price || "").trim();
  const productName = String(input?.productName || "").trim();

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

export function normalizeCreateProductInput(input) {
  return {
    ean: String(input?.ean || "").trim(),
    price: String(input?.price || "").trim().replace(",", "."),
    productName: String(input?.productName || "").trim(),
    imageUrls: parseImageUrlsFromText(input?.imagesText || "")
  };
}
