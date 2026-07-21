import { getRequiredEanError, type Labels } from "../shared/write-guardrails-model";

export function getSendToSelectedSitesPrecheckError(input: {
  ean: string;
  hasOrderDraft: boolean;
  selectedSiteKeys: string[];
  templateSiteKey: string;
  labels: Labels;
}): string | null {
  const eanError = getRequiredEanError(input.ean, input.labels);
  if (eanError) return eanError;
  if (!input.hasOrderDraft) return input.labels.createOrderDraftFirst || "";
  if (input.selectedSiteKeys.length === 0) return input.labels.chooseOneTargetSite || "";
  if (!input.templateSiteKey.trim()) return input.labels.chooseTemplateSite || "";
  return null;
}
