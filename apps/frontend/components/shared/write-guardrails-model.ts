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

export function buildActionEanRequiredMessage(action: string): string {
  if (!action) return "Form: ean is required.";
  return `${action[0].toUpperCase()}${action.slice(1)} form: ean is required.`;
}
