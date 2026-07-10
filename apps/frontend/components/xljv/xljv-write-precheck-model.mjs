import { getRequiredEanError } from "../shared/write-guardrails-model.mjs";
export { getRequiredEanError };

export function getSendToSelectedSitesPrecheckError(input) {
  const eanError = getRequiredEanError(input?.ean, input?.labels || {});
  if (eanError) return eanError;
  if (!input?.hasOrderDraft) return input?.labels?.createOrderDraftFirst || "";
  if (!Array.isArray(input?.selectedSiteKeys) || input.selectedSiteKeys.length === 0) {
    return input?.labels?.chooseOneTargetSite || "";
  }
  if (!String(input?.templateSiteKey || "").trim()) {
    return input?.labels?.chooseTemplateSite || "";
  }
  return null;
}
