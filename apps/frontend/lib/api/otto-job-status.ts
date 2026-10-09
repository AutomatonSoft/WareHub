import { apiFetch, ApiError } from "./client";

export type OttoJob = { jobId: string; controller: "jv" | "xl"; kidNumber?: string; ean?: string; skus?: string[] };
export type OttoJobStatus = {
  state?: string | null;
  total?: number | null;
  progress?: number | null;
  succeeded?: number | null;
  failed?: number | null;
  unchanged?: number | null;
  failures?: unknown;
  message?: string | null;
};

type Target = { marketplace?: string; target?: string; data?: unknown; details?: unknown };

export function extractOttoJobs(targets: Target[]): OttoJob[] {
  const jobs = new Map<string, OttoJob>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  for (const target of targets) {
    if (target.marketplace?.toLowerCase() !== "otto") continue;
    const data = target.data ?? target.details;
    if (!data || typeof data !== "object") continue;
    const record = data as Record<string, unknown>;
    const upstream = record.upstream_response;
    if (!upstream || typeof upstream !== "object") continue;
    const response = upstream as Record<string, unknown>;
    const controller = String(response.controller ?? record.profile ?? target.target?.match(/profile=(jv|xl)/i)?.[1] ?? "").toLowerCase();
    if (controller !== "jv" && controller !== "xl") continue;
    const jobId = [response.job_id, response.marketplace_job_id].find(value => typeof value === "string" && uuid.test(value));
    if (typeof jobId !== "string") continue;
    const mappingResult = record.marketplace_ean_mapping as { mapping?: { mapping?: { kid_number?: unknown; ean?: unknown } } } | undefined;
    const mapping = mappingResult?.mapping?.mapping;
    const skus = Array.isArray(response.skus) ? response.skus.filter((value): value is string => typeof value === "string" && Boolean(value.trim())) : [];
    jobs.set(`${controller}:${jobId}`, {
      jobId, controller,
      ...(typeof mapping?.kid_number === "string" && mapping.kid_number.trim() ? { kidNumber: mapping.kid_number.trim() } : {}),
      ...(typeof mapping?.ean === "string" && mapping.ean.trim() ? { ean: mapping.ean.trim() } : {}),
      ...(skus.length ? { skus } : {}),
    });
  }
  return [...jobs.values()];
}

export async function fetchOttoJobStatus(job: OttoJob): Promise<OttoJobStatus> {
  const response = await apiFetch(`/api/v1/services/otto/jobs/${encodeURIComponent(job.jobId)}/?controller=${job.controller}`);
  const payload = await response.json();
  if (!response.ok) throw new ApiError(payload.detail || `OTTO: HTTP ${response.status}`, response.status);
  return payload as OttoJobStatus;
}
