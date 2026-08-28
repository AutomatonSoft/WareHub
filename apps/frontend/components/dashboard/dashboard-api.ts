import { API_V1_ROUTES, buildApiV1Url } from "../../app/api-v1-routes";
import { DEFAULT_API_BASE } from "../../app/client-api";
import { authorizedFetch, readAuth } from "../../app/client-api-shared";
import { syncDatabaseServiceSession } from "../../app/services-session";
import { resolveServicesApiBase } from "../../lib/api/services-base";

export type DashboardWarehouseSummaryDto = {
  total_products: number;
  placed_products: number;
  unplaced_products: number;
  without_photos: number;
  without_ean: number;
  without_price: number;
  ready_for_listing: number;
  readiness_percent: number;
  in_transit_products: number;
  b_ware_products: number;
  paid_revenue: string;
  marketplace_statuses: Record<DashboardMarketplaceStatusKey, DashboardMarketplaceStatusCountsDto>;
};

export type DashboardMarketplaceStatusKey =
  | "jv"
  | "xl"
  | "otto_jv"
  | "otto_xl"
  | "ebay_jv"
  | "ebay_xl"
  | "kaufland_jv"
  | "kaufland_xl"
  | "hood_jv"
  | "hood_xl";

export type DashboardMarketplaceStatusCountsDto = {
  true_count: number;
  false_count: number;
};

export type InventoryChangeHistoryEntryDto = {
  id: number;
  occurred_at: string;
  actor: { login: string; name: string };
  action: "product_created" | "product_updated" | "marketplace_activated" | "marketplace_deactivated" | "order_memo_updated";
  product: { kid_number: string; place: string };
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  metadata: { channel?: string; entity?: string };
};

export type InventoryChangeHistoryActorDto = {
  value: string;
  label: string;
};

export type InventoryChangeHistoryResponseDto = {
  results: InventoryChangeHistoryEntryDto[];
  actors: InventoryChangeHistoryActorDto[];
  total: number;
  page: number;
  page_size: number;
};

export type ServiceLogEntry = {
  timestamp?: string;
  channel?: string;
  level?: string;
  message?: string;
  context?: string | null;
};

function getServicesApiBase(): string {
  return resolveServicesApiBase(process.env.NEXT_PUBLIC_SERVICES_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL);
}

export async function fetchDatabaseServiceWithSessionRetry(url: string): Promise<Response> {
  const request = () => fetch(url, { credentials: "include", cache: "no-store" });
  let response = await request();

  if (response.status !== 403 || typeof window === "undefined") {
    return response;
  }

  const token = readAuth()?.token;
  if (!token || !(await syncDatabaseServiceSession(token))) {
    return response;
  }

  response = await request();
  return response;
}

export async function fetchDashboardOverviewData(): Promise<DashboardWarehouseSummaryDto> {
  const base = getServicesApiBase();
  const summaryResponse = await fetchDatabaseServiceWithSessionRetry(`${base}/inventory/dashboard-summary/`);

  if (!summaryResponse.ok) {
    const payload = (await summaryResponse.json().catch(() => null)) as { code?: string; request_id?: string } | null;
    console.error("DASHBOARD_OVERVIEW_REQUEST_FAILED", {
      code: summaryResponse.status,
      error_code: payload?.code,
      request_id: payload?.request_id
    });
    throw new Error("dashboard_overview_request_failed");
  }

  const body = await summaryResponse.text();
  if (!body.trim()) {
    throw new Error("dashboard_overview_empty_response");
  }

  try {
    return JSON.parse(body) as DashboardWarehouseSummaryDto;
  } catch {
    throw new Error("dashboard_overview_invalid_response");
  }
}

export async function fetchTimelineLogs(limit = 80): Promise<ServiceLogEntry[]> {
  const [backendResp, frontendResp] = await Promise.all([
    authorizedFetch(`${buildApiV1Url(DEFAULT_API_BASE, API_V1_ROUTES.logs.channel("backend"))}?limit=${limit}`, {}, { apiBase: DEFAULT_API_BASE }),
    authorizedFetch(`${buildApiV1Url(DEFAULT_API_BASE, API_V1_ROUTES.logs.channel("frontend"))}?limit=${limit}`, {}, { apiBase: DEFAULT_API_BASE })
  ]);

  const entries: ServiceLogEntry[] = [];
  if (backendResp.ok) entries.push(...((await backendResp.json()) as ServiceLogEntry[]));
  if (frontendResp.ok) entries.push(...((await frontendResp.json()) as ServiceLogEntry[]));
  return entries;
}

export async function fetchInventoryChangeHistory(params: {
  limit?: number;
  page?: number;
  search?: string;
  actor?: string;
  dateFrom?: string;
  dateTo?: string;
  period?: "all" | "day" | "week" | "month";
  date?: string;
} = {}): Promise<InventoryChangeHistoryResponseDto> {
  const searchParams = new URLSearchParams({ limit: String(params.limit ?? 8), page: String(params.page ?? 1) });
  if (params.search?.trim()) searchParams.set("q", params.search.trim());
  if (params.actor) searchParams.set("actor", params.actor);
  if (params.period && params.period !== "all") searchParams.set("period", params.period);
  if (params.date) searchParams.set("date", params.date);
  if (params.dateFrom) searchParams.set("date_from", params.dateFrom);
  if (params.dateTo) searchParams.set("date_to", params.dateTo);

  const response = await fetchDatabaseServiceWithSessionRetry(`${getServicesApiBase()}/inventory/change-history/?${searchParams.toString()}`);
  if (!response.ok) {
    throw new Error("inventory_change_history_request_failed");
  }
  const payload = (await response.json()) as Partial<InventoryChangeHistoryResponseDto>;
  return {
    results: Array.isArray(payload.results) ? payload.results : [],
    actors: Array.isArray(payload.actors) ? payload.actors : [],
    total: typeof payload.total === "number" && Number.isFinite(payload.total) ? payload.total : 0,
    page: typeof payload.page === "number" && Number.isFinite(payload.page) ? payload.page : 1,
    page_size: typeof payload.page_size === "number" && Number.isFinite(payload.page_size) ? payload.page_size : 8,
  };
}
