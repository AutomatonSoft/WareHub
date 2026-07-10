export function getRequiredEanError(ean, labels) {
  return String(ean || "").trim() ? null : (labels?.enterEan || "Enter EAN.");
}

export function buildWriteConfirmMessage(input) {
  const actionLabel = String(input?.actionLabel || "");
  const entityLabel = String(input?.entityLabel || "");
  const entityId = String(input?.entityId || "").trim();
  const confirmTail = String(input?.confirmTail || "");
  return `${actionLabel} ${entityLabel} ${entityId}? ${confirmTail}`;
}

export function buildActionEanRequiredMessage(action, labels) {
  const value = String(action || "");
  const normalized = value.trim().toLowerCase();
  if (normalized === "create") {
    return labels?.createFormEanRequired || "Create form: EAN is required.";
  }
  if (normalized === "change" || normalized === "update") {
    return labels?.changeFormEanRequired || "Change form: ean is required.";
  }
  if (normalized === "delete") {
    return labels?.deleteFormEanRequired || "Delete form: EAN is required.";
  }
  return labels?.formEanRequired || "Form: EAN is required.";
}
