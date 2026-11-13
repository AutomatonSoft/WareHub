import { authorizedFetch } from "../../app/client-api-shared";
import { ensureRequestIdHeader } from "../../lib/api/request-id";
import type { components } from "../../lib/api/generated/orchestrator-openapi-types";

export type ReviewState = `${components["schemas"]["ProductReviewItem"]["state"]}`;
export type ReviewItem = Omit<components["schemas"]["ProductReviewItem"], "state"> & { state: ReviewState };
export type ReviewList = Omit<components["schemas"]["ProductReviewList"], "items"> & { items: ReviewItem[] };
export type ReviewDraft = Omit<components["schemas"]["ProductReviewDraft"], "item"> & { item: ReviewItem };

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await authorizedFetch(`/api/v1/orchestrator/${path}`, { ...init, headers: ensureRequestIdHeader(init.headers) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || body.detail || `HTTP ${response.status}`);
  return body as T;
}

export function fetchReviews(offset: number, query: string, signal?: AbortSignal): Promise<ReviewList> {
  return request(`reviews?${new URLSearchParams({ offset: String(offset), limit: "50", q: query })}`, { signal });
}

export function fetchReviewDraft(item: ReviewItem, signal?: AbortSignal): Promise<ReviewDraft> {
  return request(`reviews/${encodeURIComponent(item.job_id)}?${new URLSearchParams({ target: item.target })}`, { signal });
}

export function retryReview(draft: ReviewDraft, idempotencyKey: string): Promise<{ job_id: string }> {
  return request("jobs", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({
      ean: draft.item.ean,
      command: { operation: "publish", payload: {}, channels: [] },
      review: { source_job_id: draft.item.job_id, target: draft.item.target, payload: draft.payload },
    }),
  });
}
