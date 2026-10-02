import { describeMarketplaceError } from "../../components/product-forms/marketplace-errors.mjs";

export function extractFailureReason(result) {
  return describeMarketplaceError(result).message;
}

export function buildFailureSummary(results) {
  return (Array.isArray(results) ? results : []).filter((item) => item?.status === "failed").map(extractFailureReason).join("; ");
}
