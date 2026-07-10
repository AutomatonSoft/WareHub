import { buildWriteConfirmMessage } from "../shared/write-guardrails-model.mjs";

function actionLabel(action, labels) {
  if (action === "send_all_sites") return labels.sendToAllSites || "";
  if (action === "send_selected_sites") return labels.send || "";
  if (action === "send_created") return labels.send || "";
  return labels.sync || "";
}

export function buildXLJVWriteConfirmMessage(input) {
  return buildWriteConfirmMessage({
    actionLabel: actionLabel(input?.action, input?.labels || {}),
    entityLabel: input?.labels?.xljvItem || "XL/JV",
    entityId: input?.ean,
    confirmTail: input?.labels?.deleteUserConfirmTail || ""
  });
}
