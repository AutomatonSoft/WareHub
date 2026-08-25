export type OttoNormalizedProductAttribute = {
  id: string;
  label: string;
  values: string[];
};

export type OttoPayloadAttribute = {
  name: string;
  values: string[];
};

export function normalizeOttoProductAttributes(value: unknown): OttoNormalizedProductAttribute[];

export function buildOttoPayloadAttributes(input: {
  productAttributes: unknown;
  additionalAttributes?: Record<string, string>;
  attributeOverrides?: Record<string, string>;
  attributeNames?: Record<string, string>;
  removedAttributeIds?: string[];
}): OttoPayloadAttribute[];

export function extractOttoMediaUrls(product: Record<string, unknown> | undefined): string[];

export function applyReservedOttoIdentity<T extends { sku: string; ean: string }>(
  draft: T,
  reservedEan: string,
): T;
