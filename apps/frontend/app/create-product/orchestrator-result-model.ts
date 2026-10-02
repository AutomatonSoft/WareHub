import type { OrchestratorResult } from "./orchestrator-api";
import { describeMarketplaceError } from "../../components/product-forms/marketplace-errors.mjs";
import { readStoredLang } from "../i18n";

export function extractFailureReason(result: OrchestratorResult): string {
  return describeMarketplaceError(result, readStoredLang()).message;
}

export function buildFailureSummary(results: OrchestratorResult[]): string {
  return results.filter((item) => item.status === "failed").map(extractFailureReason).join("; ");
}
