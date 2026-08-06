export function deduplicateOttoAttributes(attributes) {
  const indexesByNormalizedName = new Map();
  const deduplicated = [];

  for (const attribute of attributes) {
    const name = String(attribute?.name || "").trim();
    if (!name) continue;

    const normalizedName = name.toLocaleLowerCase();
    const nextAttribute = { ...attribute, name };
    const existingIndex = indexesByNormalizedName.get(normalizedName);
    if (existingIndex === undefined) {
      indexesByNormalizedName.set(normalizedName, deduplicated.length);
      deduplicated.push(nextAttribute);
    } else {
      deduplicated[existingIndex] = { ...nextAttribute, name: deduplicated[existingIndex].name };
    }
  }

  return deduplicated;
}

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
    jv_fields: { artikelnr: productName, ean },
    ...input.additionalPayload
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
    picture_urls: imageUrls,
    ...input.additionalPayload
  };
}
