export type BuildOrchestratorPayloadInput = {
  ean: string;
  productName: string;
  price: string;
  imageUrls: string[];
  additionalPayload?: Record<string, unknown>;
};

export type OttoPayloadAttribute = {
  name: string;
  values: string[];
};

export function deduplicateOttoAttributes(attributes: OttoPayloadAttribute[]): OttoPayloadAttribute[] {
  const indexesByNormalizedName = new Map<string, number>();
  const deduplicated: OttoPayloadAttribute[] = [];

  for (const attribute of attributes) {
    const name = attribute.name.trim();
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
