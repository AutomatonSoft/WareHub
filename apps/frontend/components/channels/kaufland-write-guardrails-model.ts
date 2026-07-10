import {
  buildActionEanRequiredMessage,
  buildWriteConfirmMessage,
  type Labels
} from "../shared/write-guardrails-model";

export type KauflandWriteAction = "create" | "change" | "delete";

function actionLabel(action: KauflandWriteAction, labels: Labels): string {
  if (action === "delete") return labels.delete || "Delete";
  if (action === "change") return labels.sendUpdate || "Update";
  return labels.createProduct || "Create";
}

export function buildKauflandWriteConfirmMessage(input: {
  action: KauflandWriteAction;
  ean: string;
  labels: Labels;
}): string {
  return buildWriteConfirmMessage({
    actionLabel: actionLabel(input.action, input.labels),
    entityLabel: "Kaufland product",
    entityId: input.ean,
    confirmTail: input.labels.deleteUserConfirmTail
  });
}

export function buildKauflandRequiredEanMessage(action: KauflandWriteAction, labels: Labels): string {
  return buildActionEanRequiredMessage(action, labels);
}
