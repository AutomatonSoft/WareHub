import { buildWriteConfirmMessage, type Labels } from "../shared/write-guardrails-model";

export type XLJVWriteAction = "sync" | "send_created" | "send_all_sites" | "send_selected_sites";

function actionLabel(action: XLJVWriteAction, labels: Labels): string {
  if (action === "send_all_sites") return labels.sendToAllSites || "Send to all sites";
  if (action === "send_selected_sites") return labels.send || "Send";
  if (action === "send_created") return labels.send || "Send";
  return labels.sync || "Sync";
}

export function buildXLJVWriteConfirmMessage(input: {
  action: XLJVWriteAction;
  ean: string;
  labels: Labels;
}): string {
  return buildWriteConfirmMessage({
    actionLabel: actionLabel(input.action, input.labels),
    entityLabel: "XL/JV item",
    entityId: input.ean,
    confirmTail: input.labels.deleteUserConfirmTail
  });
}
