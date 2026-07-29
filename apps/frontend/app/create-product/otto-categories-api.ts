import { apiFetch } from "../../lib/api/client";

export type OttoCategory = {
  id: string;
  name: string;
};

export type OttoCategoryAttribute = {
  id: string;
  name: string;
  type: string;
  multiValue: boolean;
  unit: string;
  allowedValues: string[];
};

type OttoCategoriesResponse = {
  categories?: unknown;
  attributes?: unknown;
  detail?: unknown;
};

function errorMessage(payload: OttoCategoriesResponse, status: number): string {
  return typeof payload.detail === "string" && payload.detail.trim()
    ? payload.detail.trim()
    : `OTTO categories request failed: HTTP ${status}`;
}

function normalizeCategory(value: unknown): OttoCategory | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = String(item.id ?? item.categoryId ?? "").trim();
  const name = String(item.name ?? item.category ?? item.label ?? "").trim();
  return id && name ? { id, name } : null;
}

type FetchOttoCategoriesOptions = {
  query?: string;
  selectedCategoryId?: string;
};

export async function fetchOttoCategories({ query, selectedCategoryId }: FetchOttoCategoriesOptions = {}): Promise<OttoCategory[]> {
  const params = new URLSearchParams({ limit: "50" });
  if (query?.trim()) params.set("q", query.trim());
  if (selectedCategoryId?.trim()) params.set("selectedId", selectedCategoryId.trim());
  const response = await apiFetch(`/api/v1/services/otto/categories/?${params.toString()}`);
  const payload = await response.json() as OttoCategoriesResponse;
  if (!response.ok) {
    throw new Error(errorMessage(payload, response.status));
  }

  if (!Array.isArray(payload.categories)) {
    throw new Error("OTTO categories response did not contain categories.");
  }

  return payload.categories.map(normalizeCategory).filter((category): category is OttoCategory => Boolean(category));
}

function normalizeAttribute(value: unknown): OttoCategoryAttribute | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  const id = String(item.attributeId ?? item.attributeKey ?? "").trim();
  const name = String(item.name ?? item.attributeKey ?? "").trim();
  if (!id || !name) return null;
  return {
    id,
    name,
    type: String(item.type ?? "STRING").trim(),
    multiValue: item.multiValue === true,
    unit: String(item.unitDisplayName ?? item.unit ?? "").trim(),
    allowedValues: Array.isArray(item.allowedValues)
      ? item.allowedValues.map((allowedValue) => String(allowedValue).trim()).filter(Boolean)
      : [],
  };
}

export async function fetchOttoCategoryAttributes(categoryId: string): Promise<OttoCategoryAttribute[]> {
  const response = await apiFetch("/api/v1/services/otto/attributes/", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryId }),
  });
  const payload = await response.json() as OttoCategoriesResponse;
  if (!response.ok) throw new Error(errorMessage(payload, response.status));
  if (!Array.isArray(payload.attributes)) throw new Error("OTTO attributes response did not contain attributes.");
  return payload.attributes.map(normalizeAttribute).filter((attribute): attribute is OttoCategoryAttribute => Boolean(attribute));
}
