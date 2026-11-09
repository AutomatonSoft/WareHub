import { publicationSubmissionMessage } from "../../lib/marketplace-publication-display.mjs";

export function mapValidationErrorCodeToLabel(code, labels) {
  if (code === "price_numeric") return labels.validationPriceNumeric;
  return labels.validationProductNameMin3;
}

export function buildOrchestratorStatusToastMessage(input) {
  const suffix = input.failureSummary ? ` ${input.failureSummary}` : "";
  const pending = publicationSubmissionMessage(input.pendingPublicationMarketplaces ?? [], input.language);

  if (input.status === "success") {
    return {
      tone: pending ? "info" : "success",
      message: pending || `${input.labels.orchestratorSuccess}: ${input.totalResults} ${input.labels.channels}.`
    };
  }

  if (input.status === "partial_success") {
    return {
      tone: "info",
      message: `${input.labels.orchestratorPartialSuccess}: ${input.failedCount} ${input.labels.failedChannels}.${suffix}${pending ? ` ${pending}` : ""}`
    };
  }

  return {
    tone: "error",
    message: `${input.labels.orchestratorAllUpdatesFailed}.${suffix}`
  };
}
