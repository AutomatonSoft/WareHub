import { KidDto } from "./inventory-table-utils";
import { normalizeKidEanSummaryPayload, type KidEanSummaryModel } from "./kid-ean-summary-model";
import type { paths } from "../../lib/api/generated/openapi-types";
import { apiFetch } from "../../lib/api/client";
import { resolveServicesApiBase } from "../../lib/api/services-base";
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

export function getServicesApiBase(): string {
  return resolveServicesApiBase(process.env.NEXT_PUBLIC_SERVICES_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL);
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
