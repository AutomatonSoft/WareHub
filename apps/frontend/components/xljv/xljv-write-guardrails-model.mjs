import { buildWriteConfirmMessage } from "../shared/write-guardrails-model.mjs";

function actionLabel(action, labels) {
  if (action === "send_all_sites") return labels.sendToAllSites || "Send to all sites";
  if (action === "send_selected_sites") return labels.send || "Send";
  if (action === "send_created") return labels.send || "Send";
  return labels.sync || "Sync";
}

export function buildXLJVWriteConfirmMessage(input) {
  return buildWriteConfirmMessage({
    actionLabel: actionLabel(input?.action, input?.labels || {}),
    entityLabel: "XL/JV item",
    entityId: input?.ean,
    confirmTail: input?.labels?.deleteUserConfirmTail || ""
  });
}
