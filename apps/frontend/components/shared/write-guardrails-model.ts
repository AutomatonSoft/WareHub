export type Labels = Record<string, string>;

export function getRequiredEanError(ean: string, labels: Labels): string | null {
  return ean.trim() ? null : labels.enterEan || "Enter EAN.";
}

export function buildWriteConfirmMessage(input: {
  actionLabel: string;
  entityLabel: string;
  entityId: string;
  confirmTail: string;
}): string {
  const entityId = input.entityId.trim();
  return `${input.actionLabel} ${input.entityLabel} ${entityId}? ${input.confirmTail}`;
}

export function buildActionEanRequiredMessage(action: string, labels?: Labels): string {
  const normalizedAction = action.trim().toLowerCase();
  if (normalizedAction === "create") {
    return labels?.createFormEanRequired || "Create form: EAN is required.";
  }
  if (normalizedAction === "change" || normalizedAction === "update") {
    return labels?.changeFormEanRequired || "Change form: ean is required.";
  }
  if (normalizedAction === "delete") {
    return labels?.deleteFormEanRequired || "Delete form: EAN is required.";
  }
  return labels?.formEanRequired || "Form: EAN is required.";
}
