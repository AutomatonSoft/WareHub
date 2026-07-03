import { KidDto } from "./inventory-table-utils";
import { normalizeKidEanSummaryPayload, type KidEanSummaryModel } from "./kid-ean-summary-model";
import type { paths } from "../../lib/api/generated/openapi-types";
import { apiFetch } from "../../lib/api/client";
import { resolveServicesApiBase } from "../../lib/api/services-base";
import { readAuth } from "../../app/client-api-shared";
import { syncDatabaseServiceSession } from "../../app/services-session";

export type InventoryRowsApiResponse = InventoryRowsFallbackResponse;
export type InventoryFilterOptions = {
  places: string[];
  locations: Array<"warehouse" | "store">;
  quantities: string[];
  rooms: string[];
  types: string[];
  companies: string[];
  colors: string[];
  materials: string[];
};

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
  paths["/api/v1/services/orders/{id}"]["patch"]["requestBody"] extends {
    content: { "application/json": infer T };
  }
    ? T
    : Record<string, unknown>;

export type CreateKidFieldErrors = Partial<
  Record<
    | "kid_number"
    | "account"
    | "b_ware"
    | "commentary"
    | "in_transit"
    | "listing_status"
    | "store"
    | "photo"
    | "photo_files"
    | "place"
    | "room"
    | "type"
    | "quantity"
    | "company"
    | "color"
    | "size"
    | "material"
    | "price"
    ,
    string
  >
>;

export class CreateKidRequestError extends Error {
  fieldErrors: CreateKidFieldErrors;
  status: number;

  constructor(message: string, status: number, fieldErrors: CreateKidFieldErrors = {}) {
    super(message);
    this.name = "CreateKidRequestError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

export type CreateKidItemResult = {
  id: number | null;
};

export type KidGreenImportResult = {
  status: string;
  total_payloads?: number;
  unique_kids?: number;
  failed_kids?: string[];
  item_results?: KidGreenImportItemResult[];
};

export type KidGreenImportItemResult = {
  kid_number: string;
  status: string;
  fetched_items: number;
  collapsed_items: number;
  orders_created: number;
  orders_updated: number;
  skipped_without_order_id: number;
  error?: string | null;
};

export type KidGreenImportProgressEvent =
  | {
      type: "start";
      total_payloads: number;
      unique_kids: number;
    }
  | {
      type: "afterbuy_fetched";
      kid_number: string;
      completed: number;
      total: number;
      fetched_items: number;
      error?: string | null;
    }
  | ({
      type: "kid_processed";
      completed: number;
      total: number;
    } & KidGreenImportItemResult)
  | {
      type: "complete";
      status: string;
      result: KidGreenImportResult;
    }
  | {
      type: "error";
      code?: string;
      message: string;
      details?: { error?: string | null } | null;
    };

type KidGreenImportJobAccepted = {
  status: "accepted";
  job_id: string;
  progress_percent: number;
  message: string;
};

type KidGreenImportJobStatus = {
  job_id: string;
  status: "queued" | "running" | "completed" | "failed";
  stage: string;
  progress_percent: number;
  message: string;
  total_payloads?: number;
  unique_kids?: number;
  total?: number;
  completed?: number;
  current_kid?: string | null;
  result?: ({ status: string } & KidGreenImportResult) | null;
  error?: {
    code?: string;
    message: string;
    details?: { error?: string | null } | null;
  } | null;
};

type KidGreenImportRequestOptions = {
  workers?: number;
  onUploadProgress?: (percent: number) => void;
  onProgressEvent?: (event: KidGreenImportProgressEvent) => void;
};

export function getServicesApiBase(): string {
  return resolveServicesApiBase(process.env.NEXT_PUBLIC_SERVICES_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL);
}

function readErrorTextField(payload: Record<string, unknown> | null, key: string): string {
  const raw = payload?.[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function readNestedErrorText(payload: Record<string, unknown> | null, key: string): string {
  const details = payload?.details;
  if (!details || typeof details !== "object") {
    return "";
  }
  const raw = (details as Record<string, unknown>)[key];
  return typeof raw === "string" ? raw.trim() : "";
}

function formatInventoryRowsRequestError(
  response: Response,
  payload: { code?: string; message?: string; detail?: string; request_id?: string; details?: Record<string, unknown> } | null,
): Error {
  const backendMessage = readErrorTextField(payload as Record<string, unknown> | null, "message");
  const backendDetail = readErrorTextField(payload as Record<string, unknown> | null, "detail");
  const backendCode = readErrorTextField(payload as Record<string, unknown> | null, "code");
  const requestId = readErrorTextField(payload as Record<string, unknown> | null, "request_id");
  const hint = readNestedErrorText(payload as Record<string, unknown> | null, "hint");
  const nestedError = readNestedErrorText(payload as Record<string, unknown> | null, "error");
  const primaryMessage = backendMessage || backendDetail || nestedError;

  if (response.status === 403) {
    return new Error("Database service session required. Login again and retry.");
  }

  if (primaryMessage) {
    const suffix = [backendCode, requestId].filter(Boolean).join(", ");
    const hintPart = hint ? ` Hint: ${hint}` : "";
    return new Error(`${primaryMessage}${suffix ? ` (${suffix})` : ""}.${hintPart}`);
  }

  if (response.status === 502 || response.status === 503) {
    return new Error("Inventory service is unavailable. Check database-service local dev process and retry.");
  }

  return new Error(`Services inventory request failed: HTTP ${response.status}`);
}

function buildServicesUrl(path: string, params: URLSearchParams): string {
  const query = params.toString();
  return `${getServicesApiBase()}${path}${query ? `?${query}` : ""}`;
}

async function retryWithSyncedDatabaseServiceSession<T>(requestFactory: () => Promise<T>): Promise<T | null> {
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
  place?: string;
  location?: "warehouse" | "store";
  quantity?: string;
  placeSort?: "asc" | "desc";
  room?: string;
  type?: string;
  company?: string;
  color?: string;
  material?: string;
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
  if (params.place?.trim()) {
    searchParams.set("place", params.place.trim());
  }
  if (params.location === "warehouse" || params.location === "store") {
    searchParams.set("location", params.location);
  }
  if (params.quantity?.trim()) {
    searchParams.set("quantity", params.quantity.trim());
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
  if (params.company?.trim()) {
    searchParams.set("company", params.company.trim());
  }
  if (params.color?.trim()) {
    searchParams.set("color", params.color.trim());
  }
  if (params.material?.trim()) {
    searchParams.set("material", params.material.trim());
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

  const requestFactory = () => apiFetch(buildServicesUrl("/inventory/rows/", searchParams));
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
    throw formatInventoryRowsRequestError(response, payload);
  }

  return (await response.json()) as InventoryRowsApiResponse & InventoryRowsFallbackResponse;
}

export async function fetchInventoryFilterOptions(): Promise<InventoryFilterOptions> {
  const requestFactory = () => apiFetch(buildServicesUrl("/inventory/filter-options/", new URLSearchParams()));
  let response = await requestFactory();

  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) {
      response = retriedResponse;
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as
      | { code?: string; message?: string; request_id?: string; details?: Record<string, unknown> }
      | null;
    throw formatInventoryRowsRequestError(response, payload);
  }

  return (await response.json()) as InventoryFilterOptions;
}

export async function fetchInventoryRowsByKid(kidId: number, pageSize = 500): Promise<InventoryRowsApiResponse> {
  const searchParams = new URLSearchParams();
  searchParams.set("kid_id", String(kidId));
  searchParams.set("page_size", String(pageSize));

  const requestFactory = () => apiFetch(buildServicesUrl("/inventory/rows/", searchParams));
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
  const url = `${getServicesApiBase()}/kids/${params.kidId}/`;

  const response = await apiFetch(url, { method: "DELETE" });

  if (response.status === 204) return;
  if (response.status === 403) {
    throw new Error("Delete is allowed only for admin role.");
  }
  throw new Error(`Delete failed: HTTP ${response.status}`);
}

export type DeactivateJvSofortByKidResponse = {
  status: string;
  job_status?: "queued" | "running" | "completed" | "failed";
  job_id?: string;
  kid_number?: string;
  kid_id?: number;
  ean?: string;
  mode?: string;
  inactive?: boolean;
  summary?: {
    total: number;
    success: number;
    failed: number;
  };
  results?: Array<{
    ok: boolean;
    site_key: string;
    channel: string;
    status_code: number;
    details?: Record<string, unknown>;
  }>;
};

async function readJsonSafe(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function createMarketplaceToggleJob(kidNumber: string, inactive = true, place?: string): Promise<{ jobId: string }> {
  const body = {
    kid_number: kidNumber.trim(),
    inactive: Boolean(inactive),
    ...(place?.trim() ? { place: place.trim() } : {}),
  };

  const response = await apiFetch("/api/v1/orchestrator/marketplace/toggle-by-kid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    const backendMessage =
      payload && typeof payload["message"] === "string"
        ? payload["message"]
        : payload && typeof payload["detail"] === "string"
          ? payload["detail"]
          : "";
    throw new Error(backendMessage || `Marketplace toggle job create failed: HTTP ${response.status}`);
  }
  const jobId = String(payload?.["job_id"] || "").trim();
  if (!jobId) {
    throw new Error("Marketplace toggle job create failed: missing job_id");
  }
  return { jobId };
}

export async function getMarketplaceToggleJob(jobId: string): Promise<DeactivateJvSofortByKidResponse> {
  const response = await apiFetch(`/api/v1/orchestrator/marketplace/jobs/${encodeURIComponent(jobId)}`, {
    method: "GET",
  });
  const payload = await readJsonSafe(response);
  if (!response.ok) {
    const backendMessage =
      payload && typeof payload["message"] === "string"
        ? payload["message"]
        : payload && typeof payload["detail"] === "string"
          ? payload["detail"]
          : "";
    throw new Error(backendMessage || `Marketplace toggle job fetch failed: HTTP ${response.status}`);
  }
  return (payload as DeactivateJvSofortByKidResponse | null) ?? { status: "failed", job_status: "failed" };
}

export async function deactivateJvSofortByKid(kidNumber: string, inactive = true): Promise<DeactivateJvSofortByKidResponse> {
  const requestFactory = () =>
    apiFetch(`${getServicesApiBase()}/marketplace/jv/deactivate-sofort-by-kid/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kid_number: kidNumber.trim(),
        inactive: Boolean(inactive),
      }),
    });

  let response = await requestFactory();
  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) {
      response = retriedResponse;
    }
  }

  const payload = await response.json().catch(() => null) as DeactivateJvSofortByKidResponse | null;
  if (!response.ok) {
    const backendMessage =
      payload && typeof payload === "object" && "detail" in payload && typeof payload.detail === "string"
        ? payload.detail
        : payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string"
          ? payload.message
          : "";
    throw new Error(backendMessage || `JV sofort deactivate failed: HTTP ${response.status}`);
  }

  return payload ?? { status: "ok" };
}

export type KidDetailsModel = {
  id: number;
  kidNumber: string;
  account: "JV" | "XL" | "CH" | "" | null;
  place: string;
  photoUrls: string[];
  room: string;
  furnitureType: string;
  listingStatus: "listed" | "unlisted";
  bWare: boolean;
  store: boolean;
  commentary: string;
  inTransit: boolean;
};

export async function fetchKidDetails(kidId: number): Promise<KidDetailsModel> {
  const requestFactory = () => apiFetch(`${getServicesApiBase()}/kids/${kidId}/`);
  let response = await requestFactory();

  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) {
      response = retriedResponse;
    }
  }

  if (!response.ok) {
    throw new Error(`Kid details request failed: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const photoRaw = payload.photo;
  const photoUrls = Array.isArray(photoRaw)
    ? photoRaw.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const listingStatus = String(payload.listing_status || "").trim().toLowerCase() === "listed" ? "listed" : "unlisted";
  const account = typeof payload.account === "string" && payload.account.trim() ? (payload.account.trim().toUpperCase() as "JV" | "XL" | "CH") : null;

  return {
    id: typeof payload.id === "number" ? payload.id : kidId,
    kidNumber: String(payload.kid_number || "").trim(),
    account: account ?? "",
    place: String(payload.place || "").trim(),
    photoUrls,
    room: String(payload.room || "").trim(),
    furnitureType: String(payload.furniture_type || "").trim(),
    listingStatus,
    bWare: payload.b_ware === true,
    store: payload.store === true,
    commentary: String(payload.commentary || "").trim(),
    inTransit: payload.in_transit === true,
  };
}

export async function patchKidDetails(params: {
  kidId: number;
  kidNumber: string;
  account: "JV" | "XL" | "CH" | "" | null;
  place: string;
  photoUrls: string[];
  room: string;
  furnitureType: string;
  listingStatus: "listed" | "unlisted";
  bWare: boolean;
  store: boolean;
  commentary: string;
  inTransit: boolean;
}): Promise<void> {
  const body = {
    kid_number: params.kidNumber.trim(),
    account: params.account ? params.account : null,
    place: params.place.trim() || null,
    photo: params.photoUrls,
    room: params.room.trim() || null,
    furniture_type: params.furnitureType.trim() || null,
    listing_status: params.listingStatus,
    b_ware: params.bWare,
    store: params.store,
    commentary: params.commentary.trim() || null,
    in_transit: params.inTransit,
  };

  const requestFactory = () =>
    apiFetch(`${getServicesApiBase()}/kids/${params.kidId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

  let response = await requestFactory();
  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) {
      response = retriedResponse;
    }
  }

  if (!response.ok) {
    throw new Error(`Kid update failed: HTTP ${response.status}`);
  }
}

export async function createKidItem(params: {
  kidNumber: string;
  account?: "JV" | "XL" | "CH" | null;
  bWare?: boolean;
  company?: string | null;
  color?: string | null;
  commentary?: string | null;
  inTransit?: boolean;
  listingStatus?: "listed" | "unlisted" | string | null;
  store?: boolean;
  material?: string | null;
  place?: string | null;
  price?: string | null;
  quantity?: string | null;
  room?: string | null;
  size?: string | null;
  type?: string | null;
}): Promise<CreateKidItemResult> {
  const body = {
    kid_number: params.kidNumber.trim(),
    ...(params.account ? { account: params.account } : {}),
    b_ware: Boolean(params.bWare),
    in_transit: Boolean(params.inTransit),
    store: Boolean(params.store),
    ...(params.company?.trim() ? { company: params.company.trim() } : {}),
    ...(params.color?.trim() ? { color: params.color.trim() } : {}),
    ...(params.commentary?.trim() ? { commentary: params.commentary.trim() } : {}),
    ...(params.listingStatus?.trim() ? { listing_status: params.listingStatus.trim() } : {}),
    ...(params.material?.trim() ? { material: params.material.trim() } : {}),
    ...(params.place?.trim() ? { place: params.place.trim() } : {}),
    ...(params.price?.trim() ? { price: params.price.trim() } : {}),
    ...(params.quantity?.trim() ? { quantity: params.quantity.trim() } : {}),
    ...(params.room?.trim() ? { room: params.room.trim() } : {}),
    ...(params.size?.trim() ? { size: params.size.trim() } : {}),
    ...(params.type?.trim() ? { type: params.type.trim() } : {})
  };

  const requestFactory = () =>
    apiFetch(`${getServicesApiBase()}/kids/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });

  let response = await requestFactory();
  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) {
      response = retriedResponse;
    }
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const fieldErrors: CreateKidFieldErrors = {};
    const generalMessages: string[] = [];

    if (payload && typeof payload === "object") {
      for (const [rawKey, rawValue] of Object.entries(payload as Record<string, unknown>)) {
        const message = Array.isArray(rawValue)
          ? rawValue.map(String).join(" ")
          : typeof rawValue === "string"
            ? rawValue
            : rawValue && typeof rawValue === "object" && "detail" in rawValue
              ? String((rawValue as { detail?: unknown }).detail ?? "")
              : "";

        if (!message) continue;

        if (
          rawKey === "kid_number" ||
          rawKey === "account" ||
          rawKey === "b_ware" ||
          rawKey === "commentary" ||
          rawKey === "in_transit" ||
          rawKey === "listing_status" ||
          rawKey === "store" ||
          rawKey === "photo" ||
          rawKey === "photo_files" ||
          rawKey === "place" ||
          rawKey === "room" ||
          rawKey === "type" ||
          rawKey === "quantity" ||
          rawKey === "company" ||
          rawKey === "color" ||
          rawKey === "size" ||
          rawKey === "material" ||
          rawKey === "price"
        ) {
          fieldErrors[rawKey] = message;
          continue;
        }

        generalMessages.push(message);
      }
    }

    const fallbackMessage = response.status === 403 ? "Create kid is allowed only for admin role." : `Create kid failed: HTTP ${response.status}`;
    const fieldMessage = Object.values(fieldErrors).find((value) => typeof value === "string" && value.trim().length > 0);
    const generalMessage = generalMessages.find((value) => value.trim().length > 0);
    throw new CreateKidRequestError(generalMessage || fieldMessage || fallbackMessage, response.status, fieldErrors);
  }

  const payload = (await response.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof payload?.id === "number" && Number.isFinite(payload.id) ? payload.id : null;
  return { id };
}

export async function fetchEanPoolCount(): Promise<number | null> {
  const response = await apiFetch("/api/v1/services/ean-pool/stats/");
  if (!response.ok) {
    return null;
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

  return null;
}

export async function bulkUpdateKids(params: {
  updates: Array<{
    kidId: number;
    room?: string;
    type?: string;
    quantity?: string;
    company?: string;
    color?: string;
    size?: string;
    material?: string;
    price?: string;
    currency?: string;
    listingStatus?: "listed" | "unlisted";
  }>;
}): Promise<number> {
  const payload = {
    updates: params.updates.map((item) => ({
      kid_id: item.kidId,
      room: item.room,
      type: item.type,
      quantity: item.quantity,
      company: item.company,
      color: item.color,
      size: item.size,
      material: item.material,
      price: item.price,
      currency: item.currency,
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

  const response = await apiFetch("/api/v1/uploads/images/", {
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

function normalizeKidGreenImportResult(payload: {
  status?: unknown;
  total_payloads?: unknown;
  unique_kids?: unknown;
  failed_kids?: unknown;
  item_results?: unknown;
} | null): KidGreenImportResult {
  return {
    status: typeof payload?.status === "string" ? payload.status : "ok",
    total_payloads: typeof payload?.total_payloads === "number" ? payload.total_payloads : undefined,
    unique_kids: typeof payload?.unique_kids === "number" ? payload.unique_kids : undefined,
    failed_kids: Array.isArray(payload?.failed_kids) ? payload.failed_kids.map((item) => String(item)) : undefined,
    item_results: Array.isArray(payload?.item_results)
      ? payload.item_results.map((item) => {
          const row = (item ?? {}) as Record<string, unknown>;
          return {
            kid_number: String(row.kid_number ?? ""),
            status: String(row.status ?? ""),
            fetched_items: Number(row.fetched_items ?? 0),
            collapsed_items: Number(row.collapsed_items ?? 0),
            orders_created: Number(row.orders_created ?? 0),
            orders_updated: Number(row.orders_updated ?? 0),
            skipped_without_order_id: Number(row.skipped_without_order_id ?? 0),
            error: typeof row.error === "string" ? row.error : null,
          } satisfies KidGreenImportItemResult;
        })
      : undefined,
  };
}

function uploadKidGreenFileWithXhr(
  file: File,
  workers: number,
  onUploadProgress?: (percent: number) => void,
): Promise<KidGreenImportJobAccepted> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${getServicesApiBase()}/kids/import-kid-green/?async=1`);
    xhr.withCredentials = true;
    xhr.responseType = "text";

    xhr.upload.onprogress = (event) => {
      if (!onUploadProgress || !event.lengthComputable || event.total <= 0) {
        return;
      }
      const percent = Math.max(0, Math.min(90, Math.round((event.loaded / event.total) * 90)));
      onUploadProgress(percent);
    };

    xhr.onerror = () => reject(new Error("Kid green import failed: network error."));
    xhr.onabort = () => reject(new Error("Kid green import aborted."));
    xhr.onload = () => {
      if (xhr.status === 403) {
        reject(new Error("Database service session required. Login again and retry."));
        return;
      }
      const payload = (JSON.parse(xhr.responseText || "null") as Record<string, unknown> | null) ?? null;
      if (xhr.status === 202 && typeof payload?.job_id === "string") {
        resolve({
          status: "accepted",
          job_id: payload.job_id,
          progress_percent: typeof payload.progress_percent === "number" ? payload.progress_percent : 15,
          message: typeof payload.message === "string" ? payload.message : "Upload accepted.",
        });
        return;
      }
      const message =
        typeof payload?.message === "string" && payload.message.trim().length > 0
          ? payload.message
          : payload?.details && typeof payload.details === "object" && typeof (payload.details as Record<string, unknown>).error === "string" && String((payload.details as Record<string, unknown>).error).trim().length > 0
            ? String((payload.details as Record<string, unknown>).error)
            : `Kid green import failed: HTTP ${xhr.status}`;
      reject(new Error(message));
    };

    const formData = new FormData();
    formData.append("file", file);
    formData.append("workers", String(workers));
    xhr.send(formData);
  });
}

async function fetchKidGreenImportJob(jobId: string): Promise<KidGreenImportJobStatus> {
  const response = await apiFetch(`${getServicesApiBase()}/kids/import-kid-green/jobs/${jobId}/`);
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok) {
    const message = typeof payload?.message === "string" ? payload.message : `Kid green import status failed: HTTP ${response.status}`;
    throw new Error(message);
  }
  return {
    job_id: String(payload?.job_id ?? jobId),
    status: String(payload?.status ?? "queued") as KidGreenImportJobStatus["status"],
    stage: String(payload?.stage ?? ""),
    progress_percent: typeof payload?.progress_percent === "number" ? payload.progress_percent : 0,
    message: typeof payload?.message === "string" ? payload.message : "",
    total_payloads: typeof payload?.total_payloads === "number" ? payload.total_payloads : undefined,
    unique_kids: typeof payload?.unique_kids === "number" ? payload.unique_kids : undefined,
    total: typeof payload?.total === "number" ? payload.total : undefined,
    completed: typeof payload?.completed === "number" ? payload.completed : undefined,
    current_kid: typeof payload?.current_kid === "string" ? payload.current_kid : null,
    result: payload?.result && typeof payload.result === "object"
      ? normalizeKidGreenImportResult(payload.result as Record<string, unknown>)
      : null,
    error: payload?.error && typeof payload.error === "object"
      ? {
          code: typeof (payload.error as Record<string, unknown>).code === "string" ? String((payload.error as Record<string, unknown>).code) : undefined,
          message: String((payload.error as Record<string, unknown>).message ?? "Kid green import failed."),
          details: ((payload.error as Record<string, unknown>).details as { error?: string | null } | null) ?? null,
        }
      : null,
  };
}

export async function importKidGreenFile(file: File, options: KidGreenImportRequestOptions = {}): Promise<KidGreenImportResult> {
  const workers = options.workers ?? 5;
  const requestFactory = () => uploadKidGreenFileWithXhr(file, workers, options.onUploadProgress);

  try {
    const accepted = await requestFactory();
    let announcedStart = false;

    while (true) {
      await new Promise((resolve) => window.setTimeout(resolve, 900));
      const snapshot = await fetchKidGreenImportJob(accepted.job_id);
      const total = snapshot.total ?? snapshot.unique_kids ?? 0;
      const completed = snapshot.completed ?? 0;

      if (!announcedStart && (snapshot.total_payloads || snapshot.unique_kids)) {
        options.onProgressEvent?.({
          type: "start",
          total_payloads: snapshot.total_payloads ?? 0,
          unique_kids: snapshot.unique_kids ?? total,
        });
        announcedStart = true;
      }

      if (snapshot.stage === "fetching" && total > 0) {
        options.onProgressEvent?.({
          type: "afterbuy_fetched",
          kid_number: snapshot.current_kid ?? "",
          completed,
          total,
          fetched_items: 0,
          error: null,
        });
      } else if (snapshot.stage === "processing" && total > 0) {
        options.onProgressEvent?.({
          type: "kid_processed",
          kid_number: snapshot.current_kid ?? "",
          completed,
          total,
          status: "ok",
          fetched_items: 0,
          collapsed_items: 0,
          orders_created: 0,
          orders_updated: 0,
          skipped_without_order_id: 0,
          error: null,
        });
      }

      if (snapshot.status === "completed" && snapshot.result) {
        options.onProgressEvent?.({ type: "complete", status: "ok", result: snapshot.result });
        return normalizeKidGreenImportResult(snapshot.result);
      }

      if (snapshot.status === "failed") {
        const message =
          snapshot.error?.message ||
          snapshot.message ||
          "Kid green import failed.";
        throw new Error(message);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("Database service session required")) {
      const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
      if (retriedResponse) {
        return retriedResponse;
      }
    }
    throw error;
  }
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

export async function patchKidMarketplaceEans(params: {
  kidId: number;
  mainEan: string;
  jv: string;
  xl: string;
  ottoJv: string;
  ottoXl: string;
  ebayJv: string;
  ebayXl: string;
  kauflandJv: string;
  kauflandXl: string;
  hoodJv: string;
  hoodXl: string;
}): Promise<void> {
  const response = await apiFetch(`${getServicesApiBase()}/kids/${params.kidId}/marketplace-eans/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      main_ean: params.mainEan,
      database_ean: params.mainEan,
      cosmoshop_ean: params.jv,
      opencart_ean: params.xl,
      otto_jv_ean: params.ottoJv,
      otto_xl_ean: params.ottoXl,
      ebay_jv_ean: params.ebayJv,
      ebay_xl_ean: params.ebayXl,
      kaufland_jv_ean: params.kauflandJv,
      kaufland_xl_ean: params.kauflandXl,
      hood_jv_ean: params.hoodJv,
      hood_xl_ean: params.hoodXl
    })
  });

  if (!response.ok) {
    throw new Error(`Marketplace EAN update failed: HTTP ${response.status}`);
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
  const response = await apiFetch("/api/v1/services/ean-pool/reserve/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ean: ean.trim() })
  });
  if (response.ok) {
    return { response, errorText: "" };
  }
  return { response, errorText: await response.text() };
}

export async function takeNextPoolEan(): Promise<{ response: Response; ean: string | null; errorText: string }> {
  const response = await apiFetch("/api/v1/services/ean-pool/take-next-free/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({})
  });
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok) {
    return { response, ean: parseEanFromPayload(payload), errorText: "" };
  }
  return { response, ean: null, errorText: payload ? JSON.stringify(payload) : "" };
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
  const response = await apiFetch(`/api/v1/services/ean-pool/${encodeURIComponent(normalized)}/usage/`);
  if (!response.ok) {
    throw new Error(`EAN usage request failed: HTTP ${response.status}`);
  }
  const payload = (await response.json().catch(() => ({}))) as EanUsagePayload;
  return {
    pool: payload.pool && typeof payload.pool === "object" ? payload.pool : undefined,
    usages: Array.isArray(payload.usages) ? payload.usages : []
  };
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
