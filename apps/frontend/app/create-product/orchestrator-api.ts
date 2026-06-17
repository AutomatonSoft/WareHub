import { allMarketplaceSites, xlSiteKeys } from "../../lib/marketplace-sites";
import {
  buildDirectUpdatePayload,
  buildJobUpdatePayload,
  type BuildOrchestratorPayloadInput
} from "./orchestrator-payload-model";
import { apiFetch, ApiError } from "../../lib/api/client";
import { Marketplace, Operation, type components } from "../../lib/api/generated/orchestrator-openapi-types";
import { extractErrorTextFromBody, formatCreateProductApiError } from "./create-product-api-errors";

export type OrchestratorFinalStatus = "success" | "partial_success" | "failed";
export type OrchestratorOperation = components["schemas"]["Operation"];
export type OrchestratorChannel = components["schemas"]["ChannelTarget"];

export type OrchestratorResult = {
  marketplace: string;
  target: string;
  status: "success" | "failed";
  status_code: number;
  data?: Record<string, unknown>;
  error?: {
    code: string;
    message: string;
    request_id: string;
    details: Record<string, unknown>;
  };
};

export type OrchestratorResponse = {
  request_id: string;
  status: OrchestratorFinalStatus;
  results: OrchestratorResult[];
};

const SUPPORTED_FAMILIES = new Set(["HOOD", "KAUFLAND", "OTTO", "JVMOEBEL", "XL"]);

function mapSiteIdToChannel(siteId: string): OrchestratorChannel | null {
  const site = allMarketplaceSites.find((item) => item.id === siteId);
  if (!site || !SUPPORTED_FAMILIES.has(site.family)) {
    return null;
  }

  const account = site.kind.toLowerCase();

  if (site.family === "HOOD") {
    return { marketplace: Marketplace.hood, account, changed_fields: ["title", "price", "description", "images"] };
  }

  if (site.family === "KAUFLAND") {
    return {
      marketplace: Marketplace.kaufland,
      account,
      changed_fields: ["title", "description", "price", "picture_urls", "storefront"],
      overrides: { storefront: account === "xl" ? "xl" : "jv" }
    };
  }

  if (site.family === "OTTO") {
    return {
      marketplace: Marketplace.otto,
      profile: account,
      changed_fields: ["productReference", "ean", "pricing", "productDescription", "mediaAssets"]
    };
  }

  if (site.family === "JVMOEBEL") {
    const siteKey = site.id.replace("jvmoebel-", "JV_").toUpperCase().replace("UK", "CO_UK");
    return {
      marketplace: Marketplace.xljv,
      site: "JV",
      site_key: siteKey,
      changed_fields: ["price", "source_model", "jv_fields"]
    };
  }

  if (site.family === "XL") {
    const siteKey = xlSiteKeys.find((value) => value.toLowerCase() === site.id);
    if (!siteKey) {
      return null;
    }
    return {
      marketplace: Marketplace.xljv,
      site: "XL",
      site_key: siteKey,
      changed_fields: ["price", "source_model", "quantity"]
    };
  }

  return null;
}

export function buildChannelsFromSelectedSites(siteIds: string[]): {
  channels: OrchestratorChannel[];
  unsupportedSiteIds: string[];
} {
  const channels: OrchestratorChannel[] = [];
  const unsupportedSiteIds: string[] = [];

  for (const siteId of siteIds) {
    const channel = mapSiteIdToChannel(siteId);
    if (!channel) {
      unsupportedSiteIds.push(siteId);
      continue;
    }
    channels.push(channel);
  }

  return { channels, unsupportedSiteIds };
}

function ensureSupportedChannels(selectedSiteIds: string[]): OrchestratorChannel[] {
  const { channels, unsupportedSiteIds } = buildChannelsFromSelectedSites(selectedSiteIds);
  if (channels.length === 0) {
    throw new ApiError(`No supported marketplace channels selected: ${unsupportedSiteIds.join(", ")}`, 400);
  }
  return channels;
}

export async function pushProductToOrchestrator(input: {
  ean: string;
  productName: string;
  price: string;
  imageUrls: string[];
  selectedSiteIds: string[];
}): Promise<OrchestratorResponse> {
  const channels = ensureSupportedChannels(input.selectedSiteIds);
  const payload = buildDirectUpdatePayload(input as BuildOrchestratorPayloadInput);

  const response = await apiFetch(`/api/v1/orchestrator/products/${encodeURIComponent(input.ean)}/update`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ operation: Operation.update satisfies OrchestratorOperation, payload, channels })
  });

  const body = await response.json();
  if (!response.ok) {
    const message = formatCreateProductApiError(
      response.status,
      extractErrorTextFromBody(body),
      "Orchestrator update failed."
    );
    throw new ApiError(message, response.status);
  }

  return body as OrchestratorResponse;
}

export async function createOrchestratorJob(input: {
  ean: string;
  productName: string;
  price: string;
  imageUrls: string[];
  selectedSiteIds: string[];
}): Promise<{ jobId: string; raw: Record<string, unknown> }> {
  const channels = ensureSupportedChannels(input.selectedSiteIds);
  const payload = buildJobUpdatePayload(input as BuildOrchestratorPayloadInput);

  const response = await apiFetch("/api/v1/orchestrator/jobs", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ean: input.ean,
      command: { operation: Operation.update satisfies OrchestratorOperation, payload, channels }
    })
  });
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      formatCreateProductApiError(response.status, extractErrorTextFromBody(raw), "Orchestrator job create failed."),
      response.status
    );
  }
  const jobIdRaw = raw.job_id ?? raw.id ?? raw.jobId;
  const jobId = typeof jobIdRaw === "string" ? jobIdRaw : "";
  if (!jobId) {
    throw new ApiError("Orchestrator did not return job_id", 502);
  }
  return { jobId, raw };
}

export async function getOrchestratorJob(jobId: string): Promise<Record<string, unknown>> {
  const response = await apiFetch(`/api/v1/orchestrator/jobs/${encodeURIComponent(jobId)}`);
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      formatCreateProductApiError(response.status, extractErrorTextFromBody(raw), "Orchestrator job fetch failed."),
      response.status
    );
  }
  return raw;
}

export async function getOrchestratorJobAttempts(jobId: string): Promise<Record<string, unknown>> {
  const response = await apiFetch(`/api/v1/orchestrator/jobs/${encodeURIComponent(jobId)}/attempts`);
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      formatCreateProductApiError(response.status, extractErrorTextFromBody(raw), "Orchestrator attempts fetch failed."),
      response.status
    );
  }
  return raw;
}

export async function getOrchestratorJobEvents(jobId: string): Promise<Record<string, unknown>> {
  const response = await apiFetch(`/api/v1/orchestrator/jobs/${encodeURIComponent(jobId)}/events`);
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      formatCreateProductApiError(response.status, extractErrorTextFromBody(raw), "Orchestrator events fetch failed."),
      response.status
    );
  }
  return raw;
}

export async function listReconciliationReportsByEan(ean: string): Promise<Record<string, unknown>> {
  const url = `/api/v1/orchestrator/reconciliation/reports?ean=${encodeURIComponent(ean)}`;
  const response = await apiFetch(url);
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      formatCreateProductApiError(
        response.status,
        extractErrorTextFromBody(raw),
        "Orchestrator reconciliation reports fetch failed."
      ),
      response.status
    );
  }
  return raw;
}

export async function getReconciliationReport(reportId: string): Promise<Record<string, unknown>> {
  const response = await apiFetch(`/api/v1/orchestrator/reconciliation/reports/${encodeURIComponent(reportId)}`);
  const raw = (await response.json()) as Record<string, unknown>;
  if (!response.ok) {
    throw new ApiError(
      formatCreateProductApiError(
        response.status,
        extractErrorTextFromBody(raw),
        "Orchestrator reconciliation report fetch failed."
      ),
      response.status
    );
  }
  return raw;
}
