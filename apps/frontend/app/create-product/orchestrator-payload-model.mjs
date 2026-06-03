export function buildDirectUpdatePayload(input) {
  const ean = String(input?.ean || "");
  const productName = String(input?.productName || "");
  const price = String(input?.price || "");
  const imageUrls = Array.isArray(input?.imageUrls) ? input.imageUrls : [];

  return {
    title: productName,
    description: productName,
    price,
    quantity: 1,
    images: imageUrls,
    picture_urls: imageUrls,
    productReference: `${ean}-AUTO`,
    ean,
    pricing: { salePrice: price },
    productDescription: { title: productName, description: productName },
    mediaAssets: imageUrls.map((url, idx) => ({ url, role: idx === 0 ? "MAIN" : "ALT" })),
    source_model: productName,
    jv_fields: { artikelnr: productName, ean }
  };
}

export function buildJobUpdatePayload(input) {
  const productName = String(input?.productName || "");
  const price = String(input?.price || "");
  const imageUrls = Array.isArray(input?.imageUrls) ? input.imageUrls : [];

  return {
    title: productName,
    description: productName,
    price,
    quantity: 1,
    images: imageUrls,
    picture_urls: imageUrls
  };
}
