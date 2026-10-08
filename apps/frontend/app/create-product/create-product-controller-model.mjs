export function mapValidationErrorCodeToLabel(code, labels) {
  if (code === "price_numeric") return labels.validationPriceNumeric;
  return labels.validationProductNameMin3;
}

export function buildOrchestratorStatusToastMessage(input) {
  const suffix = input.failureSummary ? ` ${input.failureSummary}` : "";
  const pending = input.pendingOttoPublications ? (input.language === "ru"
    ? "OTTO: отправлено на проверку, публикация не подтверждена. Результат — в Sofort list."
    : input.language === "de" ? "OTTO: zur Prüfung gesendet, Veröffentlichung nicht bestätigt. Status in der Sofort-Liste."
      : "OTTO: submitted for validation, publication not confirmed. Check Sofort list.") : "";

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
