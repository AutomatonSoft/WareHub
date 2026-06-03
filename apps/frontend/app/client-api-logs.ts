let disableServiceLogsForToken: string | null = null;

export async function sendServiceLog(
  apiBase: string,
  channel: "frontend" | "backend" | "mobile",
  level: string,
  message: string,
  context?: string,
  token?: string
): Promise<void> {
  const normalizedToken = token?.trim() ?? "";
  if (!normalizedToken) {
    return;
  }
  if (disableServiceLogsForToken === normalizedToken) {
    return;
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };
  headers.Authorization = `Bearer ${normalizedToken}`;
  await fetch(`${apiBase}/logs/${encodeURIComponent(channel)}`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      level,
      message,
      context
    })
  })
    .then((response) => {
      if (response.status === 401 || response.status === 403) {
        disableServiceLogsForToken = normalizedToken;
      }
    })
    .catch(() => null);
}
