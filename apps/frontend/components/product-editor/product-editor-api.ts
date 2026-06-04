"use client";

import { apiFetch, ApiError } from "../../lib/api/client";
import type {
  ProductEditorApplyResponse,
  ProductEditorApiError,
  ProductEditorDiscoverResponse,
  ProductEditorGroupId,
  ProductEditorJobResponse,
  ProductEditorLoadResponse,
  ProductEditorPlanResponse
} from "./product-editor-types";

export type ProductEditorJvDeliveryOption = {
  value: string;
  label: string;
};

export type ProductEditorJvCategoryOption = {
  value: number;
  label: string;
};

export type ProductEditorJvRubricNode = {
  id: number;
  name: string;
  parent_id: number;
  children: ProductEditorJvRubricNode[];
};

export type ProductEditorImageRole = "main" | "additional";

export type ProductEditorUploadImagesResponse = {
  uploaded_image_urls: string[];
  uploaded_image_public_urls: string[];
  image: string | null;
  image_public_url: string | null;
  additional_image_urls: string[];
  image_role: ProductEditorImageRole | string;
};

async function readJsonSafe(response: Response): Promise<Record<string, unknown>> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function toApiError(response: Response, body: Record<string, unknown>, fallbackMessage: string): ApiError {
  const message = typeof body.message === "string"
    ? body.message
    : typeof body.detail === "string"
      ? body.detail
      : fallbackMessage;
  return new ApiError(message, response.status);
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function discoverProductEditor(ean: string, activeGroup?: ProductEditorGroupId): Promise<ProductEditorDiscoverResponse> {
  const response = await apiFetch("/api/orchestrator/product-editor/discover", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ean, active_group: activeGroup ?? null })
  });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response, body, "Product Editor discover failed.");
  }
  return body as unknown as ProductEditorDiscoverResponse;
}

export async function loadProductEditorGroup(input: {
  ean: string;
  activeGroup: ProductEditorGroupId;
  baselineTargetId?: string | null;
}): Promise<ProductEditorLoadResponse> {
  const requestBody = JSON.stringify({
    ean: input.ean,
    active_group: input.activeGroup,
    baseline_target_id: input.baselineTargetId ?? null
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await apiFetch("/api/orchestrator/product-editor/load", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: requestBody
    });
    const body = await readJsonSafe(response);
    if (response.ok) {
      return body as unknown as ProductEditorLoadResponse;
    }
    const isRetryable = response.status === 504 && attempt === 0;
    if (isRetryable) {
      await waitMs(450);
      continue;
    }
    throw toApiError(response, body, "Product Editor load failed.");
  }
  throw new ApiError("Product Editor load failed.", 500);
}

export async function planProductEditor(input: {
  ean: string;
  activeGroup: ProductEditorGroupId;
  changedFields: string[];
  draft: Record<string, unknown>;
  selectedTargetIds: string[];
}): Promise<ProductEditorPlanResponse> {
  const response = await apiFetch("/api/orchestrator/product-editor/plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ean: input.ean,
      active_group: input.activeGroup,
      changed_fields: input.changedFields,
      draft: input.draft,
      selected_target_ids: input.selectedTargetIds
    })
  });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response, body, "Product Editor plan failed.");
  }
  return body as unknown as ProductEditorPlanResponse;
}

export async function applyProductEditorPlan(planId: string): Promise<ProductEditorApplyResponse> {
  const response = await apiFetch("/api/orchestrator/product-editor/apply", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plan_id: planId, confirmation: true })
  });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response, body, "Product Editor apply failed.");
  }
  return body as unknown as ProductEditorApplyResponse;
}

export async function getProductEditorJob(jobId: string): Promise<ProductEditorJobResponse> {
  const response = await apiFetch(`/api/orchestrator/product-editor/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET"
  });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response, body, "Product Editor job load failed.");
  }
  return body as unknown as ProductEditorJobResponse;
}

export function extractProductEditorApiError(error: unknown): ProductEditorApiError | null {
  if (!(error instanceof ApiError)) return null;
  return {
    code: "product_editor_frontend_api_error",
    message: error.message,
    request_id: "",
    details: { status: error.status }
  };
}

export async function getJvDeliveryOptions(): Promise<ProductEditorJvDeliveryOption[]> {
  const response = await apiFetch("/api/jv/delivery-options/?site=JV&site_key=JV_DE&language=de", { method: "GET" });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response, body, "JV delivery options load failed.");
  }

  const source = Array.isArray(body)
    ? body
    : Array.isArray(body.items)
      ? body.items
      : Array.isArray(body.options)
        ? body.options
        : Array.isArray(body.results)
          ? body.results
          : [];

  return source
    .map((row) => {
      const item = row as Record<string, unknown>;
      const rawValue = item.lieferzeitid ?? item.id ?? item.value;
      const rawLabel = item.ui_label ?? item.label ?? item.name ?? item.title ?? rawValue;
      const value = rawValue === undefined || rawValue === null ? "" : String(rawValue);
      const label = rawLabel === undefined || rawLabel === null ? value : String(rawLabel);
      if (!value) return null;
      return { value, label };
    })
    .filter((row): row is ProductEditorJvDeliveryOption => Boolean(row));
}

export async function getJvRubricOptions(): Promise<ProductEditorJvCategoryOption[]> {
  const response = await apiFetch("/api/jv/rubrics/tree/?site=JV&site_key=JV_DE&language=de", { method: "GET" });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response, body, "JV rubric tree load failed.");
  }

  const root = Array.isArray(body.items) ? body.items : Array.isArray(body) ? body : [];
  const result: ProductEditorJvCategoryOption[] = [];
  const seen = new Set<number>();

  const walk = (nodes: unknown[]) => {
    for (const node of nodes) {
      const item = node as Record<string, unknown>;
      const rawId = item.category_id ?? item.id ?? item.value;
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      const label = String(item.name ?? item.label ?? item.title ?? "");
      if (Number.isFinite(id) && !seen.has(id) && label) {
        seen.add(id);
        result.push({ value: id, label });
      }
      const children = item.children ?? item.items ?? item.subcategories ?? [];
      if (Array.isArray(children) && children.length > 0) {
        walk(children);
      }
    }
  };

  walk(root);
  result.sort((a, b) => a.label.localeCompare(b.label));
  return result;
}

export async function getJvRubricTree(): Promise<ProductEditorJvRubricNode[]> {
  const response = await apiFetch("/api/jv/rubrics/tree/?site=JV&site_key=JV_DE&language=de", { method: "GET" });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response, body, "JV rubric tree load failed.");
  }

  const rawTree = Array.isArray(body.tree) ? body.tree : [];
  if (rawTree.length > 0) {
    return normalizeRubricNodes(rawTree);
  }

  const rawItems = Array.isArray(body.items) ? body.items : [];
  return buildRubricTreeFromItems(rawItems);
}

export async function uploadProductEditorImages(input: {
  files: File[];
  site: "JV" | "XL";
  siteKey: string;
  ean?: string;
  imageRole: ProductEditorImageRole;
}): Promise<ProductEditorUploadImagesResponse> {
  const query = new URLSearchParams();
  query.set("site", input.site);
  query.set("site_key", input.siteKey);
  query.set("image_role", input.imageRole);
  if (input.ean && input.ean.trim()) {
    query.set("ean", input.ean.trim());
  }

  const formData = new FormData();
  for (const file of input.files) {
    formData.append("images", file);
  }

  const response = await apiFetch(`/api/uploads/images/?${query.toString()}`, {
    method: "POST",
    body: formData
  });
  const body = await readJsonSafe(response);
  if (!response.ok) {
    throw toApiError(response, body, "Image upload failed.");
  }
  return body as unknown as ProductEditorUploadImagesResponse;
}

function normalizeRubricNodes(input: unknown[]): ProductEditorJvRubricNode[] {
  return input
    .map((row) => {
      const item = row as Record<string, unknown>;
      const rawId = item.category_id ?? item.id;
      const id = typeof rawId === "number" ? rawId : Number(rawId);
      if (!Number.isFinite(id)) return null;
      const parentRaw = item.parent_id;
      const parentId = typeof parentRaw === "number" ? parentRaw : Number(parentRaw ?? 0);
      const name = String(item.name ?? "").trim();
      const childrenRaw = Array.isArray(item.children) ? item.children : [];
      return {
        id,
        name: name || `Category ${id}`,
        parent_id: Number.isFinite(parentId) ? parentId : 0,
        children: normalizeRubricNodes(childrenRaw)
      };
    })
    .filter((row): row is ProductEditorJvRubricNode => Boolean(row));
}

function buildRubricTreeFromItems(input: unknown[]): ProductEditorJvRubricNode[] {
  const byId = new Map<number, ProductEditorJvRubricNode>();
  for (const row of input) {
    const item = row as Record<string, unknown>;
    const rawId = item.category_id ?? item.id;
    const id = typeof rawId === "number" ? rawId : Number(rawId);
    if (!Number.isFinite(id)) continue;
    const parentRaw = item.parent_id;
    const parentId = typeof parentRaw === "number" ? parentRaw : Number(parentRaw ?? 0);
    const name = String(item.name ?? "").trim();
    byId.set(id, {
      id,
      name: name || `Category ${id}`,
      parent_id: Number.isFinite(parentId) ? parentId : 0,
      children: []
    });
  }

  const roots: ProductEditorJvRubricNode[] = [];
  for (const node of byId.values()) {
    const parent = byId.get(node.parent_id);
    if (!parent) {
      roots.push(node);
    } else {
      parent.children.push(node);
    }
  }
  return roots;
}
