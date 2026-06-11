import { KidDto } from "./inventory-table-utils";
import { normalizeKidEanSummaryPayload, type KidEanSummaryModel } from "./kid-ean-summary-model";
import type { paths } from "../../lib/api/generated/openapi-types";
import { apiFetch } from "../../lib/api/client";
import { readAuth } from "../../app/client-api-shared";
import { syncDatabaseServiceSession } from "../../app/services-session";

export type InventoryRowsApiResponse = InventoryRowsFallbackResponse;

type InventoryRowsFallbackResponse =
  | KidDto[]
  | {
      count?: number;
      next?: string | null;
      previous?: string | null;
      page?: number;
      page_size?: number;
      results?: KidDto[];
    };

type PatchOrderBody =
  paths["/api/v1/orders/{order_db_id}/"]["patch"]["requestBody"] extends {
    content: { "application/json": infer T };
  }
    ? T
    : Record<string, unknown>;

export function getServicesApiBase(): string {
  const raw =
    process.env.NEXT_PUBLIC_SERVICES_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    "/api/services/v1";
  const normalized = raw.replace(/\/+$/, "");
  if (
    normalized === "http://localhost:8934" ||
    normalized === "http://127.0.0.1:8934" ||
    normalized.startsWith("http://localhost:8934/api/v1") ||
    normalized.startsWith("http://127.0.0.1:8934/api/v1")
  ) {
    return "/api/services/v1";
  }
  return normalized;
}
function buildServicesUrl(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return `${getServicesApiBase()}${path}${query ? `?${query}` : ""}`;
}

async function retryWithSyncedDatabaseServiceSession(requestFactory: () => Promise<Response>): Promise<Response | null> {
  if (typeof window === "undefined") {
    return null;
  }

  const auth = readAuth();
  if (!auth?.token) {
    return null;
  }

  const synced = await syncDatabaseServiceSession(auth.token).catch(() => false);
  if (!synced) {
    return null;
  }

  return requestFactory();
}

export async function fetchInventoryRows(params: {
  page: number;
  pageSize: number;
  q?: string;
  placeSort?: "asc" | "desc";
  room?: string;
  type?: string;
  listing?: "listed" | "unlisted";
  sort?: "place" | "quantity";
  dir?: "asc" | "desc";
}): Promise<InventoryRowsApiResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("page", String(params.page));
  searchParams.set("page_size", String(params.pageSize));
  if (params.q?.trim()) {
    searchParams.set("q", params.q.trim());
  }
  if (params.placeSort === "asc" || params.placeSort === "desc") {
    searchParams.set("place_sort", params.placeSort);
  }
  if (params.room?.trim()) {
    searchParams.set("room", params.room.trim());
  }
  if (params.type?.trim()) {
    searchParams.set("type", params.type.trim());
  }
  if (params.listing === "listed" || params.listing === "unlisted") {
    searchParams.set("listing", params.listing);
  }
  if (params.sort === "place" || params.sort === "quantity") {
    searchParams.set("sort", params.sort);
  }
  if (params.dir === "asc" || params.dir === "desc") {
    searchParams.set("dir", params.dir);
  }

  const requestFactory = () => apiFetch(buildServicesUrl("/inventory/rows", searchParams));
  let response = await requestFactory();

  if (!response.ok) {
    if (response.status === 403) {
      const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
      if (retriedResponse) {
        response = retriedResponse;
      }
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { code?: string; message?: string; request_id?: string; details?: Record<string, unknown> }
      | null;
    const backendMessage = typeof payload?.message === "string" ? payload.message.trim() : "";
    const backendCode = typeof payload?.code === "string" ? payload.code.trim() : "";
    const requestId = typeof payload?.request_id === "string" ? payload.request_id.trim() : "";
    const hint =
      payload?.details && typeof payload.details === "object" && typeof payload.details.hint === "string"
        ? payload.details.hint.trim()
        : "";
    if (response.status === 403) {
      throw new Error("Database service session required. Login again and retry.");
    }
    if (backendMessage) {
      const suffix = [backendCode, requestId].filter(Boolean).join(", ");
      const hintPart = hint ? ` Hint: ${hint}` : "";
      throw new Error(`${backendMessage}${suffix ? ` (${suffix})` : ""}.${hintPart}`);
    }
    throw new Error(`Services inventory request failed: HTTP ${response.status}`);
  }

  return (await response.json()) as InventoryRowsApiResponse & InventoryRowsFallbackResponse;
}

export async function fetchInventoryRowsByKid(kidId: number, pageSize = 500): Promise<InventoryRowsApiResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("kid_id", String(kidId));
  searchParams.set("page_size", String(pageSize));

  const requestFactory = () => apiFetch(buildServicesUrl("/inventory/rows", searchParams));
  let response = await requestFactory();
  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) {
      response = retriedResponse;
    }
  }
  if (!response.ok) {
    if (response.status === 403) {
      throw new Error("Database service session required. Login again and retry.");
    }
    throw new Error(`Inventory details request failed: HTTP ${response.status}`);
  }
  return (await response.json()) as InventoryRowsApiResponse & InventoryRowsFallbackResponse;
}

export async function deleteOrder(orderDbId: number): Promise<void> {
  const response = await apiFetch(`${getServicesApiBase()}/orders/${orderDbId}/`, {
    method: "DELETE"
  });
  if (response.status !== 204) {
    throw new Error(`Delete failed: HTTP ${response.status}`);
  }
}

export async function patchOrderAdditionalItems(params: {
  orderDbId: number;
  orderId: string;
  additionalItems: unknown[];
}): Promise<void> {
  const response = await apiFetch(`${getServicesApiBase()}/orders/${params.orderDbId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      order_id: params.orderId,
      additional_items: params.additionalItems
    } satisfies PatchOrderBody)
  });
  if (!response.ok) {
    throw new Error(`Child delete failed: HTTP ${response.status}`);
  }
}

export async function deleteInventoryEntity(params: {
  entity: "order" | "kid";
  orderDbId: number | null;
  kidId: number;
}): Promise<void> {
  const url =
    params.entity === "order" && params.orderDbId
      ? `${getServicesApiBase()}/orders/${params.orderDbId}/`
      : `${getServicesApiBase()}/kids/${params.kidId}/`;

  const response = await apiFetch(url, { method: "DELETE" });

  if (response.status === 204) return;
  if (response.status === 403) {
    throw new Error("Delete is allowed only for admin role.");
  }
  throw new Error(`Delete failed: HTTP ${response.status}`);
}

export async function createKidItem(params: {
  kidNumber: string;
  place?: string;
  photo?: string;
  photoFiles?: File[];
}): Promise<void> {
  const formData = new FormData();
  formData.set("kid_number", params.kidNumber.trim());
  if (params.place?.trim()) formData.set("place", params.place.trim());
  if (params.photo?.trim()) formData.set("photo", params.photo.trim());
  for (const file of params.photoFiles ?? []) formData.append("photo_files", file);

  const response = await apiFetch(`${getServicesApiBase()}/kids/`, {
    method: "POST",
    body: formData
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const message =
      typeof payload === "object" && payload !== null
        ? Object.values(payload as Record<string, unknown>)
            .flatMap((value) => (Array.isArray(value) ? value.map(String) : [String(value)]))
            .join(" ")
        : "";
    throw new Error(message || `Create item failed: HTTP ${response.status}`);
  }
}

export async function fetchEanPoolCount(): Promise<number | null> {
  const endpoints = ["/api/services/v1/ean-pool/stats/", "/api/services/ean-pool/stats/"];

  for (const endpoint of endpoints) {
    const response = await apiFetch(endpoint);
    if (!response.ok) {
      continue;
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const totalRaw =
      payload.total ??
      payload.total_count ??
      payload.count ??
      payload.pool_count ??
      payload.available ??
      payload.free;

    if (typeof totalRaw === "number" && Number.isFinite(totalRaw)) {
      return totalRaw;
    }
  }

  return null;
}

export async function bulkUpdateKids(params: {
  updates: Array<{
    kidId: number;
    room?: string;
    type?: string;
    color?: string;
    size?: string;
    material?: string;
    price?: string;
    listingStatus?: "listed" | "unlisted";
  }>;
}): Promise<number> {
  const payload = {
    updates: params.updates.map((item) => ({
      kid_id: item.kidId,
      room: item.room,
      type: item.type,
      color: item.color,
      size: item.size,
      material: item.material,
      price: item.price,
      listing_status: item.listingStatus
    }))
  };
  const response = await apiFetch(`${getServicesApiBase()}/kids/bulk-update/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`Bulk update failed: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { updated?: number };
  return Number.isFinite(data.updated) ? Number(data.updated) : 0;
}

export async function uploadKidImages(files: File[]): Promise<string[]> {
  const formData = new FormData();
  for (const file of files) {
    formData.append("images", file);
  }

  const response = await apiFetch("/api/services/uploads/images/", {
    method: "POST",
    body: formData
  });

  if (!response.ok) {
    throw new Error(`Image upload failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { uploaded_image_urls?: unknown };
  const urls = Array.isArray(payload.uploaded_image_urls)
    ? payload.uploaded_image_urls.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (urls.length === 0) {
    throw new Error("Upload completed but no image URLs returned.");
  }

  return urls;
}

export async function patchKidPhotoUrls(kidId: number, photoUrls: string[]): Promise<void> {
  const response = await apiFetch(`${getServicesApiBase()}/kids/${kidId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ photo: photoUrls })
  });

  if (!response.ok) {
    throw new Error(`Kid photo update failed: HTTP ${response.status}`);
  }
}

function parseEanFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }
  const raw = payload.ean ?? payload.value ?? payload.code;
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

export async function reservePoolEan(ean: string): Promise<{ response: Response; errorText: string }> {
  const endpoints = ["/api/services/v1/ean-pool/reserve/", "/api/services/ean-pool/reserve/"];
  let lastResponse: Response | null = null;
  let lastErrorText = "";

  for (const endpoint of endpoints) {
    const response = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ean: ean.trim() })
    });
    if (response.ok) {
      return { response, errorText: "" };
    }
    lastErrorText = await response.text();
    lastResponse = response;
  }

  if (!lastResponse) {
    throw new Error("Reserve EAN request failed before response.");
  }
  return { response: lastResponse, errorText: lastErrorText };
}

export async function takeNextPoolEan(): Promise<{ response: Response; ean: string | null; errorText: string }> {
  const endpoints = ["/api/services/v1/ean-pool/take-next-free/", "/api/services/ean-pool/take-next-free/"];
  let lastResponse: Response | null = null;
  let lastErrorText = "";

  for (const endpoint of endpoints) {
    const response = await apiFetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
    if (response.ok) {
      return { response, ean: parseEanFromPayload(payload), errorText: "" };
    }
    lastErrorText = payload ? JSON.stringify(payload) : "";
    lastResponse = response;
  }

  if (!lastResponse) {
    throw new Error("Take next free EAN request failed before response.");
  }
  return { response: lastResponse, ean: null, errorText: lastErrorText };
}

export type EanUsagePayload = {
  pool?: Record<string, unknown>;
  usages?: unknown[];
};


export async function fetchEanUsageByEan(ean: string): Promise<EanUsagePayload> {
  const normalized = ean.trim();
  if (!normalized) {
    return { pool: undefined, usages: [] };
  }
  const endpoints = [
    `/api/services/v1/ean-pool/${encodeURIComponent(normalized)}/usage/`,
    `/api/services/ean-pool/${encodeURIComponent(normalized)}/usage/`
  ];

  let lastStatus = 0;
  for (const endpoint of endpoints) {
    const response = await apiFetch(endpoint);
    lastStatus = response.status;
    if (!response.ok) {
      continue;
    }
    const payload = (await response.json().catch(() => ({}))) as EanUsagePayload;
    return {
      pool: payload.pool && typeof payload.pool === "object" ? payload.pool : undefined,
      usages: Array.isArray(payload.usages) ? payload.usages : []
    };
  }
  throw new Error(`EAN usage request failed: HTTP ${lastStatus || 0}`);
}

export async function fetchKidEanSummary(kidId: number): Promise<KidEanSummaryModel> {
  const endpoints = [
    `${getServicesApiBase()}/kids/${kidId}/ean-summary/`,
    `${getServicesApiBase().replace(/\/v1$/, "")}/kids/${kidId}/ean-summary/`
  ];
  let lastStatus = 0;

  for (const endpoint of endpoints) {
    const response = await apiFetch(endpoint);
    lastStatus = response.status;
    if (!response.ok) {
      continue;
    }
    const payload = (await response.json().catch(() => null)) as unknown;
    return normalizeKidEanSummaryPayload(payload, kidId);
  }

  throw new Error(`Kid EAN summary request failed: HTTP ${lastStatus || 0}`);
}
