import { DEFAULT_INVENTORY_WORKSPACE, type InventoryWorkspace } from "../inventory/inventory-api";

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function withInventoryWorkspace(path: string, workspace: InventoryWorkspace = DEFAULT_INVENTORY_WORKSPACE): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}workspace=${encodeURIComponent(workspace)}`;
}

function parseEanFromPayload(payload: Record<string, unknown> | null): string | null {
  if (!payload) {
    return null;
  }
  const raw = payload.ean ?? payload.value ?? payload.code;
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

export async function fetchEanPoolStatsCount(workspace: InventoryWorkspace = DEFAULT_INVENTORY_WORKSPACE): Promise<number | null> {
  const response = await fetchWithTimeout(withInventoryWorkspace("/api/v1/services/ean-pool/stats/", workspace), { credentials: "include", cache: "no-store" }, 6000);
  if (response.ok) {
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

export async function importEansToPool(eans: string[], workspace: InventoryWorkspace = DEFAULT_INVENTORY_WORKSPACE): Promise<{
  response: Response;
  importedCount: number;
  errorText: string;
}> {
  const response = await fetchWithTimeout(
    withInventoryWorkspace("/api/v1/services/ean-pool/import/", workspace),
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

export async function reserveEan(ean: string, workspace: InventoryWorkspace = DEFAULT_INVENTORY_WORKSPACE): Promise<{ response: Response; errorText: string }> {
  const response = await fetchWithTimeout(
    withInventoryWorkspace("/api/v1/services/ean-pool/reserve/", workspace),
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
  return { response, errorText: await response.text() };
}

export async function takeNextFreeEan(workspace: InventoryWorkspace = DEFAULT_INVENTORY_WORKSPACE): Promise<{ response: Response; ean: string | null; errorText: string }> {
  const response = await fetchWithTimeout(
    withInventoryWorkspace("/api/v1/services/ean-pool/take-next-free/", workspace),
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
  return { response, ean: null, errorText: payload ? JSON.stringify(payload) : "" };
}

export async function claimEanForKid(input: {
  kidNumber: string;
  reservationFamily: "jv" | "xl";
  workspace?: InventoryWorkspace;
}): Promise<{ response: Response; ean: string | null; errorText: string }> {
  const response = await fetchWithTimeout(
    withInventoryWorkspace("/api/v1/services/ean-pool/claim-for-job/", input.workspace),
    {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        job_id: crypto.randomUUID(),
        kid_number: input.kidNumber,
        reservation_family: input.reservationFamily,
      }),
    },
    10000,
  );
  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (response.ok) {
    return { response, ean: parseEanFromPayload(payload), errorText: "" };
  }
  return { response, ean: null, errorText: payload ? JSON.stringify(payload) : "" };
}
