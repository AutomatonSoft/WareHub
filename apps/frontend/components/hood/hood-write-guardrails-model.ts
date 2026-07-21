import { buildWriteConfirmMessage, type Labels } from "../shared/write-guardrails-model";

export type HoodWriteAction = "patch" | "upload_images" | "delete_image";

function actionLabel(action: HoodWriteAction, labels: Labels): string {
  if (action === "delete_image") return labels.deleteFromFtp || "";
  if (action === "upload_images") return labels.uploadImagesToFtpAction || "";
  return labels.patchAction || "";
}

export function buildHoodWriteConfirmMessage(input: {
  action: HoodWriteAction;
  ean: string;
  labels: Labels;
}): string {
  return buildWriteConfirmMessage({
    actionLabel: actionLabel(input.action, input.labels),
    entityLabel: input.labels.hoodItem || "HOOD",
    entityId: input.ean,
    confirmTail: input.labels.deleteUserConfirmTail
  });
}
