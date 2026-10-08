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

export function applyOttoDefaultAttributes<T extends {
  additionalAttributes: Record<string, string>;
  attributeOverrides: Record<string, string>;
  attributeNames: Record<string, string>;
  removedAttributeIds: string[];
}>(draft: T, productAttributes: unknown, attributes: Array<{ id: string; name: string; defaultValue?: string }>): T;

export function applyOttoAttributeSuggestions<T extends {
  additionalAttributes: Record<string, string>;
  attributeOverrides: Record<string, string>;
  attributeNames: Record<string, string>;
  removedAttributeIds: string[];
}>(draft: T, productAttributes: unknown, suggestions: Array<{ id: string; name: string; value: string }>): { draft: T; applied: number };

export function buildOttoPayloadAttributes(input: {
  productAttributes: unknown;
  additionalAttributes?: Record<string, string>;
  attributeOverrides?: Record<string, string>;
  attributeNames?: Record<string, string>;
  removedAttributeIds?: string[];
}): OttoPayloadAttribute[];

export function extractOttoMediaUrls(product: Record<string, unknown> | undefined): string[];

export declare const OTTO_PRODUCT_LINE_MAX_LENGTH: 70;
export declare const OTTO_BASE_COLORS: readonly string[];

export function isOttoProductLineValid(value: unknown): boolean;

export function applyReservedOttoIdentity<T extends { sku: string; ean: string }>(
  draft: T,
  reservedEan: string,
): T;
