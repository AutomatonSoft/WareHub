import { API_V1_ROUTES, buildApiV1Url } from "./api-v1-routes";
import { authorizedFetch, getAccessToken } from "./client-api-shared";

let disableServiceLogsForToken: string | null = null;

export async function sendServiceLog(
  apiBase: string,
  channel: "frontend" | "backend" | "mobile",
  level: string,
  message: string,
  context?: string,
  token?: string
): Promise<void> {
  const normalizedToken = token?.trim() || getAccessToken() || "";
  if (!normalizedToken) {
    return;
  }
  if (disableServiceLogsForToken === normalizedToken) {
    return;
  }
  await authorizedFetch(buildApiV1Url(apiBase, API_V1_ROUTES.logs.channel(channel)), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      level,
      message,
      context
    })
  }, {
    apiBase,
    token: normalizedToken
  })
    .then((response) => {
      if (response.status === 401 || response.status === 403) {
        disableServiceLogsForToken = normalizedToken;
      }
    })
    .catch(() => null);
}
