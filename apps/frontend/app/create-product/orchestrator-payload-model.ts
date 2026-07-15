export type BuildOrchestratorPayloadInput = {
  ean: string;
  productName: string;
  price: string;
  imageUrls: string[];
  additionalPayload?: Record<string, unknown>;
};

export function buildDirectUpdatePayload(input: BuildOrchestratorPayloadInput): Record<string, unknown> {
  return {
    title: input.productName,
    description: input.productName,
    price: input.price,
    quantity: 1,
    images: input.imageUrls,
    picture_urls: input.imageUrls,
    productReference: `${input.ean}-AUTO`,
    ean: input.ean,
    pricing: { salePrice: input.price },
    productDescription: { title: input.productName, description: input.productName },
    mediaAssets: input.imageUrls.map((url, idx) => ({ url, role: idx === 0 ? "MAIN" : "ALT" })),
    source_model: input.productName,
    jv_fields: { artikelnr: input.productName, ean: input.ean },
    ...input.additionalPayload
  };
}

export function buildJobUpdatePayload(input: BuildOrchestratorPayloadInput): Record<string, unknown> {
  return {
    title: input.productName,
    description: input.productName,
    price: input.price,
    quantity: 1,
    images: input.imageUrls,
    picture_urls: input.imageUrls,
    ...input.additionalPayload
  };
}
