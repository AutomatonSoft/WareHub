import { buildWriteConfirmMessage } from "../shared/write-guardrails-model.mjs";

function actionLabel(action, labels) {
  if (action === "delete_image") return labels.deleteFromFtp || "";
  if (action === "upload_images") return labels.uploadImagesToFtpAction || "";
  return labels.patchAction || "";
}

export function buildHoodWriteConfirmMessage(input) {
  return buildWriteConfirmMessage({
    actionLabel: actionLabel(input?.action, input?.labels || {}),
    entityLabel: input?.labels?.hoodItem || "HOOD",
    entityId: input?.ean,
    confirmTail: input?.labels?.deleteUserConfirmTail || ""
  });
}
