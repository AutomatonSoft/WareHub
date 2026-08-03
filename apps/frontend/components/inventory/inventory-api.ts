import { KidDto } from "./inventory-table-utils";
import { normalizeKidEanSummaryPayload, type KidEanSummaryModel } from "./kid-ean-summary-model";
import type { paths } from "../../lib/api/generated/openapi-types";
import { readStoredLabel } from "../../app/i18n";
import { apiFetch } from "../../lib/api/client";
import { resolveServicesApiBase } from "../../lib/api/services-base";
import { authorizedFetch, readAuth } from "../../app/client-api-shared";
import { syncDatabaseServiceSession } from "../../app/services-session";

export type InventoryRowsApiResponse = InventoryRowsFallbackResponse;
export type InventoryFilterOptions = {
  places: string[];
  available_places?: string[];
  sections: string[];
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
    | "store"
    | "photo"
    | "photo_files"
    | "place"
    | "section"
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

export type PlaceSuggestionHints = {
  requestedPlace: string | null;
  currentPlace: string | null;
  sameBaseSubplace: string | null;
  nextFreeBasePlace: string | null;
};

export class CreateKidRequestError extends Error {
  fieldErrors: CreateKidFieldErrors;
  status: number;
  placeSuggestions: PlaceSuggestionHints;

  constructor(
    message: string,
    status: number,
    fieldErrors: CreateKidFieldErrors = {},
    placeSuggestions: PlaceSuggestionHints = {
      requestedPlace: null,
      currentPlace: null,
      sameBaseSubplace: null,
      nextFreeBasePlace: null,
    }
  ) {
    super(message);
    this.name = "CreateKidRequestError";
    this.status = status;
    this.fieldErrors = fieldErrors;
    this.placeSuggestions = placeSuggestions;
  }
}

function parseKidRequestErrorPayload(payload: unknown): {
  fieldErrors: CreateKidFieldErrors;
  generalMessage: string | null;
  placeSuggestions: PlaceSuggestionHints;
} {
  const fieldErrors: CreateKidFieldErrors = {};
  const generalMessages: string[] = [];
  const placeSuggestions: PlaceSuggestionHints = {
    requestedPlace: null,
    currentPlace: null,
    sameBaseSubplace: null,
    nextFreeBasePlace: null,
  };

  if (payload && typeof payload === "object") {
    const payloadRecord = payload as Record<string, unknown>;
    const details = payloadRecord.details;
    if (details && typeof details === "object") {
      const detailsRecord = details as Record<string, unknown>;
      placeSuggestions.requestedPlace =
        typeof detailsRecord.requested_place === "string" ? detailsRecord.requested_place.trim() || null : null;
      placeSuggestions.currentPlace =
        typeof detailsRecord.current_place === "string" ? detailsRecord.current_place.trim() || null : null;
      placeSuggestions.sameBaseSubplace =
        typeof detailsRecord.same_base_subplace === "string" ? detailsRecord.same_base_subplace.trim() || null : null;
      placeSuggestions.nextFreeBasePlace =
        typeof detailsRecord.next_free_base_place === "string" ? detailsRecord.next_free_base_place.trim() || null : null;
    }

    for (const [rawKey, rawValue] of Object.entries(payloadRecord)) {
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
        rawKey === "store" ||
        rawKey === "photo" ||
        rawKey === "photo_files" ||
        rawKey === "place" ||
        rawKey === "section" ||
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

  const fieldMessage = Object.values(fieldErrors).find((value) => typeof value === "string" && value.trim().length > 0) ?? null;
  const generalMessage = generalMessages.find((value) => value.trim().length > 0) ?? null;
  return { fieldErrors, generalMessage: generalMessage || fieldMessage, placeSuggestions };
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

function inventoryLabel(key: string, fallback: string): string {
  return readStoredLabel(key, fallback);
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
    return new Error(inventoryLabel("databaseServiceSessionRequired", "Database service session required. Login again and retry."));
  }

  if (primaryMessage) {
    const suffix = [backendCode, requestId].filter(Boolean).join(", ");
    const hintPart = hint ? ` Hint: ${hint}` : "";
    return new Error(`${primaryMessage}${suffix ? ` (${suffix})` : ""}.${hintPart}`);
  }

  if (response.status === 502 || response.status === 503) {
    return new Error(inventoryLabel("inventoryServiceUnavailable", "Inventory service is unavailable. Check database-service local dev process and retry."));
  }

  return new Error(`${inventoryLabel("failedLoadInventory", "Failed to load inventory.")}: HTTP ${response.status}`);
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
  section?: string;
  location?: "warehouse" | "store";
  quantity?: string;
  placeSort?: "asc" | "desc";
  room?: string;
  type?: string;
  company?: string;
  color?: string;
  material?: string;
  bWare?: boolean;
  inTransit?: boolean;
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
  if (params.section?.trim()) {
    searchParams.set("section", params.section.trim());
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
  if (params.bWare) {
    searchParams.set("b_ware", "true");
  }
  if (params.inTransit) {
    searchParams.set("in_transit", "true");
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
      throw new Error(inventoryLabel("databaseServiceSessionRequired", "Database service session required. Login again and retry."));
    }
    throw new Error(`${inventoryLabel("failedLoadInventoryDetails", "Failed to load inventory details.")}: HTTP ${response.status}`);
  }
  return (await response.json()) as InventoryRowsApiResponse & InventoryRowsFallbackResponse;
}

export async function deleteOrder(orderDbId: number): Promise<void> {
  const response = await apiFetch(`${getServicesApiBase()}/orders/${orderDbId}/`, {
    method: "DELETE"
  });
  if (response.status !== 204) {
    throw new Error(`${inventoryLabel("deleteFailed", "Delete failed")}: HTTP ${response.status}`);
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
    throw new Error(`${inventoryLabel("failedUpdateChildItems", "Failed to update child items.")}: HTTP ${response.status}`);
  }
}

export type OrderMemoSyncResult = {
  syncStatus: "synced" | "pending" | "failed";
  syncError: string | null;
  syncErrorType: string | null;
};

export async function patchOrderMemo(params: {
  orderDbId: number;
  memo: string;
}): Promise<OrderMemoSyncResult> {
  const response = await apiFetch(`${getServicesApiBase()}/orders/${params.orderDbId}/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      memo: params.memo.trim() || null,
    } satisfies PatchOrderBody),
  });

  if (!response.ok) {
    throw new Error(`${inventoryLabel("failedUpdateOrder", "Failed to update order.")}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const syncStatus = payload.memo_sync_status;
  return {
    syncStatus: syncStatus === "pending" || syncStatus === "failed" ? syncStatus : "synced",
    syncError: typeof payload.memo_sync_error === "string" && payload.memo_sync_error.trim()
      ? payload.memo_sync_error
      : null,
    syncErrorType: typeof payload.memo_sync_error_type === "string" && payload.memo_sync_error_type.trim()
      ? payload.memo_sync_error_type
      : null,
  };
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
    throw new Error(inventoryLabel("deleteAllowedOnlyAdmin", "Delete is allowed only for admin role."));
  }
  throw new Error(`${inventoryLabel("deleteFailed", "Delete failed")}: HTTP ${response.status}`);
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

  const response = await authorizedFetch("/api/v1/orchestrator/marketplace/toggle-by-kid", {
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
    throw new Error(backendMessage || `${inventoryLabel("marketplaceToggleJobCreateFailed", "Marketplace toggle job create failed.")}: HTTP ${response.status}`);
  }
  const jobId = String(payload?.["job_id"] || "").trim();
  if (!jobId) {
    throw new Error(inventoryLabel("marketplaceToggleJobMissingId", "Marketplace toggle job was accepted but no job id was returned."));
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
    throw new Error(backendMessage || `${inventoryLabel("marketplaceToggleJobFetchFailed", "Failed to load marketplace toggle job.")}: HTTP ${response.status}`);
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
    throw new Error(backendMessage || `${inventoryLabel("jvSofortDeactivateFailed", "JV sofort deactivate failed.")}: HTTP ${response.status}`);
  }

  return payload ?? { status: "ok" };
}

export type KidDetailsModel = {
  id: number;
  kidNumber: string;
  account: "JV" | "XL" | "CH" | "" | null;
  place: string;
  section: string;
  photoUrls: string[];
  room: string;
  furnitureType: string;
  bWare: boolean;
  store: boolean;
  commentary: string;
  inTransit: boolean;
};

export type KidDetailViewModel = {
  kid: {
    id: number;
    kidNumber: string;
    account: "JV" | "XL" | "CH" | "" | null;
    place: string;
    section: string;
    photoUrls: string[];
    room: string;
    furnitureType: string;
    bWare: boolean;
    store: boolean;
    commentary: string;
    inTransit: boolean;
  };
  ean: Record<string, string> | null;
  eanStatus: Record<string, boolean> | null;
  productAttributes: {
    quantity: number | null;
    company: string | null;
    color: string | null;
    size: string | null;
    material: string | null;
    price: string | null;
    currency: string | null;
  } | null;
  client: {
    billingFirstName: string;
    billingLastName: string;
    billingCompany: string;
    billingStreet: string;
    billingStreet2: string;
    billingPostalCode: string;
    billingCity: string;
    billingStateOrProvince: string;
    billingCountry: string;
    billingCountryIso: string;
    billingPhone: string;
    billingFax: string;
    billingEmail: string;
    shippingFirstName: string;
    shippingLastName: string;
    shippingCompany: string;
    shippingStreet: string;
    shippingStreet2: string;
    shippingPostalCode: string;
    shippingCity: string;
    shippingStateOrProvince: string;
    shippingCountry: string;
    shippingCountryIso: string;
  } | null;
  orders: Array<{
    id: number;
    orderId: string;
    platform: string | null;
    buyer: string | null;
    sku: string | null;
    title: string;
    memo: string | null;
    memoSyncStatus: "synced" | "pending" | "failed";
    memoSyncError: string | null;
    memoSyncErrorType: string | null;
    status: string;
    orderDate: string | null;
    invoiceNumber: string | null;
    invoiceAmount: string | null;
    paymentDate: string | null;
    paymentMethod: string | null;
    shippingMethod: string | null;
    fullAmount: string | null;
    alreadyPaid: string | null;
    outstandingAmount: string | null;
    isFullyPaid: boolean;
    additionalItems: unknown[];
    items: Array<{
      id: number;
      afterbuyItemId: string;
      title: string;
      quantity: number | null;
      itemPrice: string | null;
      itemEndDate: string | null;
      currency: string;
      isMainItem: boolean;
    }>;
  }>;
  inventoryChangeLog: Array<{
    id: number;
    occurredAt: string;
    actor: { login: string; name: string };
    action: string;
    kidNumber: string;
    place: string;
    changes: Array<{ field?: string; before?: unknown; after?: unknown }>;
    metadata: Record<string, unknown>;
  }>;
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
    throw new Error(`${inventoryLabel("failedLoadKidDetails", "Failed to load kid details.")}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const photoRaw = payload.photo;
  const photoUrls = Array.isArray(photoRaw)
    ? photoRaw.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const account = typeof payload.account === "string" && payload.account.trim() ? (payload.account.trim().toUpperCase() as "JV" | "XL" | "CH") : null;

  return {
    id: typeof payload.id === "number" ? payload.id : kidId,
    kidNumber: String(payload.kid_number || "").trim(),
    account: account ?? "",
    place: String(payload.place || "").trim(),
    section: String(payload.section || "").trim(),
    photoUrls,
    room: String(payload.room || "").trim(),
    furnitureType: String(payload.furniture_type || "").trim(),
    bWare: payload.b_ware === true,
    store: payload.store === true,
    commentary: String(payload.commentary || "").trim(),
    inTransit: payload.in_transit === true,
  };
}

export async function fetchKidDetailView(kidId: number): Promise<KidDetailViewModel> {
  const requestFactory = () => apiFetch(`${getServicesApiBase()}/kids/${kidId}/detail-view/`);
  let response = await requestFactory();

  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) {
      response = retriedResponse;
    }
  }

  if (!response.ok) {
    throw new Error(`${inventoryLabel("failedLoadKidDetails", "Failed to load kid details.")}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const kidPayload = (payload.kid as Record<string, unknown> | null) ?? {};
  const photoRaw = kidPayload.photo;
  const photoUrls = Array.isArray(photoRaw)
    ? photoRaw.map((item) => String(item || "").trim()).filter(Boolean)
    : [];
  const account = typeof kidPayload.account === "string" && kidPayload.account.trim()
    ? (kidPayload.account.trim().toUpperCase() as "JV" | "XL" | "CH")
    : null;

  const productAttributesPayload = payload.product_attributes && typeof payload.product_attributes === "object"
    ? (payload.product_attributes as Record<string, unknown>)
    : null;
  const eanPayload = payload.ean && typeof payload.ean === "object"
    ? (payload.ean as Record<string, unknown>)
    : null;
  const eanStatusPayload = payload.ean_status && typeof payload.ean_status === "object"
    ? (payload.ean_status as Record<string, unknown>)
    : null;
  const clientPayload = payload.client && typeof payload.client === "object"
    ? (payload.client as Record<string, unknown>)
    : null;

  return {
    kid: {
      id: typeof kidPayload.id === "number" ? kidPayload.id : kidId,
      kidNumber: String(kidPayload.kid_number || "").trim(),
      account: account ?? "",
      place: String(kidPayload.place || "").trim(),
      section: String(kidPayload.section || "").trim(),
      photoUrls,
      room: String(kidPayload.room || "").trim(),
      furnitureType: String(kidPayload.furniture_type || "").trim(),
      bWare: kidPayload.b_ware === true,
      store: kidPayload.store === true,
      commentary: String(kidPayload.commentary || "").trim(),
      inTransit: kidPayload.in_transit === true,
    },
    ean: eanPayload
      ? Object.fromEntries(
        Object.entries(eanPayload).map(([key, value]) => [key, String(value ?? "").trim()])
      )
      : null,
    eanStatus: eanStatusPayload
      ? Object.fromEntries(
        Object.entries(eanStatusPayload).map(([key, value]) => [key, value === true])
      )
      : null,
    productAttributes: productAttributesPayload
      ? {
        quantity: typeof productAttributesPayload.quantity === "number" ? productAttributesPayload.quantity : null,
        company: typeof productAttributesPayload.company === "string" ? productAttributesPayload.company : null,
        color: typeof productAttributesPayload.color === "string" ? productAttributesPayload.color : null,
        size: typeof productAttributesPayload.size === "string" ? productAttributesPayload.size : null,
        material: typeof productAttributesPayload.material === "string" ? productAttributesPayload.material : null,
        price: productAttributesPayload.price == null ? null : String(productAttributesPayload.price),
        currency: typeof productAttributesPayload.currency === "string" ? productAttributesPayload.currency : null,
      }
      : null,
    client: clientPayload
      ? {
        billingFirstName: String(clientPayload.billing_first_name || "").trim(),
        billingLastName: String(clientPayload.billing_last_name || "").trim(),
        billingCompany: String(clientPayload.billing_company || "").trim(),
        billingStreet: String(clientPayload.billing_street || "").trim(),
        billingStreet2: String(clientPayload.billing_street_2 || "").trim(),
        billingPostalCode: String(clientPayload.billing_postal_code || "").trim(),
        billingCity: String(clientPayload.billing_city || "").trim(),
        billingStateOrProvince: String(clientPayload.billing_state_or_province || "").trim(),
        billingCountry: String(clientPayload.billing_country || "").trim(),
        billingCountryIso: String(clientPayload.billing_country_iso || "").trim(),
        billingPhone: String(clientPayload.billing_phone || "").trim(),
        billingFax: String(clientPayload.billing_fax || "").trim(),
        billingEmail: String(clientPayload.billing_email || "").trim(),
        shippingFirstName: String(clientPayload.shipping_first_name || "").trim(),
        shippingLastName: String(clientPayload.shipping_last_name || "").trim(),
        shippingCompany: String(clientPayload.shipping_company || "").trim(),
        shippingStreet: String(clientPayload.shipping_street || "").trim(),
        shippingStreet2: String(clientPayload.shipping_street_2 || "").trim(),
        shippingPostalCode: String(clientPayload.shipping_postal_code || "").trim(),
        shippingCity: String(clientPayload.shipping_city || "").trim(),
        shippingStateOrProvince: String(clientPayload.shipping_state_or_province || "").trim(),
        shippingCountry: String(clientPayload.shipping_country || "").trim(),
        shippingCountryIso: String(clientPayload.shipping_country_iso || "").trim(),
      }
      : null,
    orders: Array.isArray(payload.orders)
      ? payload.orders.map((raw) => {
        const item = (raw as Record<string, unknown> | null) ?? {};
        return {
          id: typeof item.id === "number" ? item.id : 0,
          orderId: String(item.order_id || "").trim(),
          platform: typeof item.platform === "string" ? item.platform : null,
          buyer: typeof item.buyer === "string" ? item.buyer : null,
          sku: typeof item.sku === "string" ? item.sku : null,
          title: String(item.title || "").trim(),
          memo: typeof item.memo === "string" ? item.memo : null,
          memoSyncStatus: item.memo_sync_status === "pending" || item.memo_sync_status === "failed"
            ? item.memo_sync_status
            : "synced",
          memoSyncError: typeof item.memo_sync_error === "string" && item.memo_sync_error.trim()
            ? item.memo_sync_error
            : null,
          memoSyncErrorType: typeof item.memo_sync_error_type === "string" && item.memo_sync_error_type.trim()
            ? item.memo_sync_error_type
            : null,
          status: String(item.status || "").trim(),
          orderDate: typeof item.order_date === "string" ? item.order_date : null,
          invoiceNumber: typeof item.invoice_number === "string" ? item.invoice_number : null,
          invoiceAmount: item.invoice_amount == null ? null : String(item.invoice_amount),
          paymentDate: typeof item.payment_date === "string" ? item.payment_date : null,
          paymentMethod: typeof item.payment_method === "string" ? item.payment_method : null,
          shippingMethod: typeof item.shipping_method === "string" ? item.shipping_method : null,
          fullAmount: typeof item.full_amount === "string" ? item.full_amount : null,
          alreadyPaid: item.already_paid == null ? null : String(item.already_paid),
          outstandingAmount: item.outstanding_amount == null ? null : String(item.outstanding_amount),
          isFullyPaid: item.is_fully_paid === true,
          additionalItems: Array.isArray(item.additional_items) ? item.additional_items : [],
          items: Array.isArray(item.items)
            ? item.items.map((rawItem) => {
              const orderItem = (rawItem as Record<string, unknown> | null) ?? {};
              return {
                id: typeof orderItem.id === "number" ? orderItem.id : 0,
                afterbuyItemId: String(orderItem.afterbuy_item_id || "").trim(),
                title: String(orderItem.title || "").trim(),
                quantity: typeof orderItem.quantity === "number" ? orderItem.quantity : null,
                itemPrice: orderItem.item_price == null ? null : String(orderItem.item_price),
                itemEndDate: typeof orderItem.item_end_date === "string" ? orderItem.item_end_date : null,
                currency: String(orderItem.currency || "").trim(),
                isMainItem: orderItem.is_main_item === true,
              };
            })
            : [],
        };
      })
      : [],
    inventoryChangeLog: Array.isArray(payload.inventory_change_log)
      ? payload.inventory_change_log.map((raw) => {
        const item = (raw as Record<string, unknown> | null) ?? {};
        const actorRaw = item.actor && typeof item.actor === "object" ? (item.actor as Record<string, unknown>) : {};
        return {
          id: typeof item.id === "number" ? item.id : 0,
          occurredAt: String(item.occurred_at || "").trim(),
          actor: {
            login: String(actorRaw.login || "").trim(),
            name: String(actorRaw.name || "").trim(),
          },
          action: String(item.action || "").trim(),
          kidNumber: String(item.kid_number || "").trim(),
          place: String(item.place || "").trim(),
          changes: Array.isArray(item.changes) ? item.changes as Array<{ field?: string; before?: unknown; after?: unknown }> : [],
          metadata: item.metadata && typeof item.metadata === "object" ? item.metadata as Record<string, unknown> : {},
        };
      })
      : [],
  };
}

export async function patchKidDetails(params: {
  kidId: number;
  kidNumber: string;
  account: "JV" | "XL" | "CH" | "" | null;
  place: string;
  section: string;
  photoUrls: string[];
  room: string;
  furnitureType: string;
  bWare: boolean;
  store: boolean;
  commentary: string;
  inTransit: boolean;
}): Promise<void> {
  const body = {
    kid_number: params.kidNumber.trim(),
    account: params.account ? params.account : null,
    place: params.place.trim() || null,
    section: params.section.trim() || null,
    photo: params.photoUrls,
    room: params.room.trim() || null,
    furniture_type: params.furnitureType.trim() || null,
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
    const payload = await response.json().catch(() => null);
    const { fieldErrors, generalMessage, placeSuggestions } = parseKidRequestErrorPayload(payload);
    throw new CreateKidRequestError(generalMessage || `${inventoryLabel("failedSaveChanges", "Failed to save changes.")}: HTTP ${response.status}`, response.status, fieldErrors, placeSuggestions);
  }
}

export async function patchKidComposite(params: {
  kidId: number;
  kid: Record<string, unknown>;
  ean: Record<string, unknown>;
  productAttributes: Record<string, unknown>;
}): Promise<void> {
  const requestFactory = () =>
    apiFetch(`${getServicesApiBase()}/kids/${params.kidId}/composite-update/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        kid: params.kid,
        ean: params.ean,
        product_attributes: params.productAttributes,
      }),
    });

  let response = await requestFactory();
  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) response = retriedResponse;
  }

  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const { fieldErrors, generalMessage, placeSuggestions } = parseKidRequestErrorPayload(payload);
    throw new CreateKidRequestError(generalMessage || `${inventoryLabel("failedSaveChanges", "Failed to save changes.")}: HTTP ${response.status}`, response.status, fieldErrors, placeSuggestions);
  }
}

const MARKETPLACE_STATUS_FIELD_BY_ROW_KEY = {
  jv: "jv",
  xl: "xl",
  ottoJv: "otto_jv",
  ottoXl: "otto_xl",
  ebayJv: "ebay_jv",
  ebayXl: "ebay_xl",
  kauflandJv: "kaufland_jv",
  kauflandXl: "kaufland_xl",
  hoodJv: "hood_jv",
  hoodXl: "hood_xl",
} as const;

export type MarketplaceStatusRowKey = keyof typeof MARKETPLACE_STATUS_FIELD_BY_ROW_KEY;

export async function patchKidMarketplaceStatus(params: {
  kidId: number;
  marketplace: MarketplaceStatusRowKey;
  status: boolean;
}): Promise<void> {
  const requestFactory = () =>
    apiFetch(`${getServicesApiBase()}/kids/${params.kidId}/marketplace-status/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        marketplace: MARKETPLACE_STATUS_FIELD_BY_ROW_KEY[params.marketplace],
        status: params.status,
      }),
    });

  let response = await requestFactory();
  if (!response.ok && response.status === 403) {
    const retriedResponse = await retryWithSyncedDatabaseServiceSession(requestFactory);
    if (retriedResponse) {
      response = retriedResponse;
    }
  }

  if (!response.ok) {
    throw new Error(`${inventoryLabel("failedSaveChanges", "Failed to save changes.")}: HTTP ${response.status}`);
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
  store?: boolean;
  material?: string | null;
  place?: string | null;
  section?: string | null;
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
    ...(params.material?.trim() ? { material: params.material.trim() } : {}),
    ...(params.place?.trim() ? { place: params.place.trim() } : {}),
    ...(params.section?.trim() ? { section: params.section.trim() } : {}),
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
    const { fieldErrors, generalMessage, placeSuggestions } = parseKidRequestErrorPayload(payload);

    const fallbackMessage = response.status === 403
      ? inventoryLabel("createKidAdminOnly", "Create kid is allowed only for admin role.")
      : `${inventoryLabel("createKidFailedPrefix", "Create KID failed:").replace(/:\s*$/, "")}: HTTP ${response.status}`;
    throw new CreateKidRequestError(generalMessage || fallbackMessage, response.status, fieldErrors, placeSuggestions);
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
      currency: item.currency
    }))
  };
  const response = await apiFetch(`${getServicesApiBase()}/kids/bulk-update/`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`${inventoryLabel("bulkUpdateFailed", "Bulk update failed.")}: HTTP ${response.status}`);
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
    throw new Error(`${inventoryLabel("imageUploadFailed", "Image upload failed")}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as { uploaded_image_urls?: unknown };
  const urls = Array.isArray(payload.uploaded_image_urls)
    ? payload.uploaded_image_urls.map((item) => String(item || "").trim()).filter(Boolean)
    : [];

  if (urls.length === 0) {
    throw new Error(inventoryLabel("uploadCompletedNoImageUrlsReturned", "Upload completed but no image URLs returned."));
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

    xhr.onerror = () => reject(new Error(inventoryLabel("kidGreenImportNetworkError", "Kid green import failed: network error.")));
    xhr.onabort = () => reject(new Error(inventoryLabel("kidGreenImportAborted", "Kid green import aborted.")));
    xhr.onload = () => {
      if (xhr.status === 403) {
        reject(new Error(inventoryLabel("databaseServiceSessionRequired", "Database service session required. Login again and retry.")));
        return;
      }
      const payload = (JSON.parse(xhr.responseText || "null") as Record<string, unknown> | null) ?? null;
      if (xhr.status === 202 && typeof payload?.job_id === "string") {
        resolve({
          status: "accepted",
          job_id: payload.job_id,
          progress_percent: typeof payload.progress_percent === "number" ? payload.progress_percent : 15,
          message: typeof payload.message === "string" ? payload.message : inventoryLabel("uploadAccepted", "Upload accepted."),
        });
        return;
      }
      const message =
        typeof payload?.message === "string" && payload.message.trim().length > 0
          ? payload.message
          : payload?.details && typeof payload.details === "object" && typeof (payload.details as Record<string, unknown>).error === "string" && String((payload.details as Record<string, unknown>).error).trim().length > 0
            ? String((payload.details as Record<string, unknown>).error)
            : `${inventoryLabel("kidGreenImportFailed", "Kid green import failed.")}: HTTP ${xhr.status}`;
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
    const message = typeof payload?.message === "string" ? payload.message : `${inventoryLabel("kidGreenImportStatusFailed", "Failed to load Kid green import status.")}: HTTP ${response.status}`;
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
          message: String((payload.error as Record<string, unknown>).message ?? inventoryLabel("kidGreenImportFailed", "Kid green import failed.")),
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
          inventoryLabel("kidGreenImportFailed", "Kid green import failed.");
        throw new Error(message);
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes(inventoryLabel("databaseServiceSessionRequired", "Database service session required. Login again and retry."))) {
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
    throw new Error(`${inventoryLabel("kidPhotoUpdateFailed", "Failed to update kid photos.")}: HTTP ${response.status}`);
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
    throw new Error(`${inventoryLabel("marketplaceEanUpdateFailed", "Failed to update marketplace EANs.")}: HTTP ${response.status}`);
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
    throw new Error(`${inventoryLabel("failedLoadEanUsage", "Failed to load EAN usage.")}: HTTP ${response.status}`);
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

  throw new Error(`${inventoryLabel("failedLoadKidEanSummary", "Failed to load kid EAN summary.")}: HTTP ${lastStatus || 0}`);
}
