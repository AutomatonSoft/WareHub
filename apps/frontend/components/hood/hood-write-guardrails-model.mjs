import { buildWriteConfirmMessage } from "../shared/write-guardrails-model.mjs";

function actionLabel(action, labels) {
  if (action === "delete_image") return labels.deleteFromFtp || "Delete from FTP";
  if (action === "upload_images") return labels.uploadImagesToFtpAction || "Upload images";
  return labels.patchAction || "Patch";
}

export function buildHoodWriteConfirmMessage(input) {
  return buildWriteConfirmMessage({
    actionLabel: actionLabel(input?.action, input?.labels || {}),
    entityLabel: "HOOD item",
    entityId: input?.ean,
    confirmTail: input?.labels?.deleteUserConfirmTail || ""
  });
}
