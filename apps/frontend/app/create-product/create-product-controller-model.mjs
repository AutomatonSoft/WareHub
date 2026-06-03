export function mapValidationErrorCodeToLabel(code, labels) {
  if (code === "ean_exactly_13_digits") return labels.validationEanExact13Digits;
  if (code === "price_numeric") return labels.validationPriceNumeric;
  return labels.validationProductNameMin3;
}

export function buildOrchestratorStatusToastMessage(input) {
  const suffix = input.failureSummary ? ` ${input.failureSummary}` : "";

  if (input.status === "success") {
    return {
      tone: "success",
      message: `${input.labels.orchestratorSuccess}: ${input.totalResults} ${input.labels.channels}.`
    };
  }

  if (input.status === "partial_success") {
    return {
      tone: "info",
      message: `${input.labels.orchestratorPartialSuccess}: ${input.failedCount} ${input.labels.failedChannels}.${suffix}`
    };
  }

  return {
    tone: "error",
    message: `${input.labels.orchestratorAllUpdatesFailed}.${suffix}`
  };
}
