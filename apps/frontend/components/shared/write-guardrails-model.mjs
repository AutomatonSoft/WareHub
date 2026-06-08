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

export function buildActionEanRequiredMessage(action) {
  const value = String(action || "");
  if (!value) return "Form: ean is required.";
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)} form: ean is required.`;
}
