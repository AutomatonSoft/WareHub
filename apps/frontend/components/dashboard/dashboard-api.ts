import { API_V1_ROUTES, buildApiV1Url } from "../../app/api-v1-routes";
import { DEFAULT_API_BASE } from "../../app/client-api";
import { authorizedFetch } from "../../app/client-api-shared";
import { apiFetch } from "../../lib/api/client";
import { resolveServicesApiBase } from "../../lib/api/services-base";

export type DashboardKidDto = {
  id: number;
};

export type DashboardOrderDto = {
  id?: number | string;
  status?: string | null;
  global_price?: string | null;
  date?: string | null;
  quantity?: number | null;
  title?: string | null;
  sku?: string | null;
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

export async function fetchDashboardOverviewData(): Promise<{
  kids: DashboardKidDto[];
  orders: DashboardOrderDto[];
}> {
  const base = getServicesApiBase();
  const [kidsResponse, ordersResponse] = await Promise.all([
    fetch(`${base}/kids/`, { credentials: "include", cache: "no-store" }),
    fetch(`${base}/orders/`, { credentials: "include", cache: "no-store" })
  ]);

  if (!kidsResponse.ok || !ordersResponse.ok) {
    const code = !kidsResponse.ok ? kidsResponse.status : ordersResponse.status;
    console.error("DASHBOARD_OVERVIEW_REQUEST_FAILED", { code });
    throw new Error("Unable to load dashboard data right now. Please try again later.");
  }

  return {
    kids: (await kidsResponse.json()) as DashboardKidDto[],
    orders: (await ordersResponse.json()) as DashboardOrderDto[]
  };
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
