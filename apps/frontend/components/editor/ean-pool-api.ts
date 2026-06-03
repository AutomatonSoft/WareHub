async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function parseEanFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }
  const raw = payload.ean ?? payload.value ?? payload.code;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function fetchEanPoolStatsCount(): Promise<number | null> {
  const endpoints = ["/api/services/v1/ean-pool/stats/", "/api/services/ean-pool/stats/"];
  for (const endpoint of endpoints) {
    const response = await fetchWithTimeout(endpoint, { credentials: "include", cache: "no-store" }, 6000);
    if (!response.ok) continue;
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

export async function importEansToPool(eans: string[]): Promise<{
  response: Response;
  importedCount: number;
  errorText: string;
}> {
  const response = await fetchWithTimeout(
    "/api/services/ean-pool/import/",
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eans })
    },
    15000
  );

  if (!response.ok) {
    const text = await response.text();
    return { response, importedCount: 0, errorText: text };
  }

  let importedCount = eans.length;
  try {
    const payload = (await response.json()) as Record<string, unknown>;
    const importedRaw = payload.imported ?? payload.created ?? payload.count ?? payload.total;
    if (typeof importedRaw === "number" && Number.isFinite(importedRaw)) {
      importedCount = importedRaw;
    }
  } catch {
  }

  return { response, importedCount, errorText: "" };
}

export async function reserveEan(ean: string): Promise<{ response: Response; errorText: string }> {
  const endpoints = ["/api/services/v1/ean-pool/reserve/", "/api/services/ean-pool/reserve/"];
  let lastResponse: Response | null = null;
  let lastErrorText = "";

  for (const endpoint of endpoints) {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ean })
      },
      10000
    );
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

export async function takeNextFreeEan(): Promise<{ response: Response; ean: string | null; errorText: string }> {
  const endpoints = ["/api/services/v1/ean-pool/take-next-free/", "/api/services/ean-pool/take-next-free/"];
  let lastResponse: Response | null = null;
  let lastErrorText = "";

  for (const endpoint of endpoints) {
    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      },
      10000
    );
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
