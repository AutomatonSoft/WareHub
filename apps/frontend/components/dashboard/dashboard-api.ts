import { apiFetch } from "../../lib/api/client";

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

export async function fetchDashboardOverviewData(): Promise<{
  kids: DashboardKidDto[];
  orders: DashboardOrderDto[];
}> {
  const base = getServicesApiBase();
  const [kidsResponse, ordersResponse] = await Promise.all([
    fetch(`${base}/kids`, { credentials: "include", cache: "no-store" }),
    fetch(`${base}/orders`, { credentials: "include", cache: "no-store" })
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
    apiFetch(`/api/backend/logs/backend?limit=${limit}`),
    apiFetch(`/api/backend/logs/frontend?limit=${limit}`)
  ]);

  const entries: ServiceLogEntry[] = [];
  if (backendResp.ok) entries.push(...((await backendResp.json()) as ServiceLogEntry[]));
  if (frontendResp.ok) entries.push(...((await frontendResp.json()) as ServiceLogEntry[]));
  return entries;
}
