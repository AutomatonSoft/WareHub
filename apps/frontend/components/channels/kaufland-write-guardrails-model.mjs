import {
  buildActionEanRequiredMessage,
  buildWriteConfirmMessage
} from "../shared/write-guardrails-model.mjs";

function actionLabel(action, labels) {
  if (action === "delete") return labels.delete || "Delete";
  if (action === "change") return labels.sendUpdate || "Update";
  return labels.createProduct || "Create";
}

export function buildKauflandWriteConfirmMessage(input) {
  return buildWriteConfirmMessage({
    actionLabel: actionLabel(input?.action, input?.labels || {}),
    entityLabel: "Kaufland product",
    entityId: input?.ean,
    confirmTail: input?.labels?.deleteUserConfirmTail || ""
  });
}

export function buildKauflandRequiredEanMessage(action, labels) {
  return buildActionEanRequiredMessage(action, labels);
}
