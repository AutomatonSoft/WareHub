import type { AfterbuyKidOrderMatch, AfterbuyKidOrdersData, AfterbuyOrderData } from "./client-api-types";
import { API_V1_ROUTES, buildApiV1Url } from "./api-v1-routes";
import { authorizedFetch, parseError } from "./client-api-shared";

export function parseOrderIdFromQr(qrCode: string): string | null {
  const source = qrCode.trim();
  if (!source) {
    return null;
  }
  const first = source.split("|")[0]?.trim() ?? "";
  if (!first) {
    return null;
  }
  return first;
}

export async function fetchAfterbuyOrder(
  apiBase: string,
  token: string,
  orderId: string
): Promise<AfterbuyOrderData> {
  const response = await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.afterbuy.order(orderId)), {}, { apiBase, token });
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(parseError(payload, `Afterbuy request failed: HTTP ${response.status}`));
  }
  return (await response.json()) as AfterbuyOrderData;
}

export async function fetchAfterbuyOrdersByKid(
  apiBase: string,
  token: string,
  kidNumber: string
): Promise<AfterbuyKidOrdersData> {
  const response = await authorizedFetch(
    buildApiV1Url(apiBase, API_V1_ROUTES.afterbuy.kidOrders(kidNumber)),
    {},
    { apiBase, token }
  );
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    throw new Error(parseError(payload, `Afterbuy KID search failed: HTTP ${response.status}`));
  }
  const payload = (await response.json()) as Partial<AfterbuyKidOrdersData> | null;
  const safeMatches = Array.isArray(payload?.matches)
    ? payload.matches
        .filter((item): item is AfterbuyKidOrderMatch => {
          return (
            Boolean(item) &&
            typeof item === "object" &&
            typeof item.order_id === "string" &&
            typeof item.title === "string"
          );
        })
        .map((item) => ({
          order_id: item.order_id.trim(),
          title: item.title.trim()
        }))
        .filter((item) => item.order_id.length > 0)
    : [];

  return {
    kid_number: typeof payload?.kid_number === "string" ? payload.kid_number : kidNumber,
    account: typeof payload?.account === "string" ? payload.account : "n/a",
    url: typeof payload?.url === "string" ? payload.url : "",
    final_url: typeof payload?.final_url === "string" ? payload.final_url : "",
    http_status: typeof payload?.http_status === "number" ? payload.http_status : response.status,
    page_title: typeof payload?.page_title === "string" ? payload.page_title : null,
    login_required: Boolean(payload?.login_required),
    relogin_performed: Boolean(payload?.relogin_performed),
    page_preview: typeof payload?.page_preview === "string" ? payload.page_preview : "",
    matches: safeMatches
  };
}

export function parsePhotoUrls(value: string | null): string[] {
  if (!value) {
    return [];
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return [];
  }
  if (trimmed.startsWith("[")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter((item) => item.length > 0);
      }
    } catch {
      // Fallback to delimiter parsing below.
    }
  }
  return trimmed
    .split(/[,\n\r;]+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export function resolvePhotoUrl(apiBase: string, url: string): string {
  const normalized = url.trim();
  if (!normalized) {
    return normalized;
  }
  if (normalized.startsWith("http://") || normalized.startsWith("https://")) {
    return normalized;
  }
  if (apiBase.startsWith("http://") || apiBase.startsWith("https://")) {
    try {
      const base = new URL(apiBase);
      return new URL(normalized, `${base.origin}/`).toString();
    } catch {
      return normalized;
    }
  }
  return normalized;
}
