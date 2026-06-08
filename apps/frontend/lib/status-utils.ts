export type SyncTone = "success" | "warning" | "danger";

export function syncTone(status: string): SyncTone {
  if (status === "Healthy") {
    return "success";
  }

  if (status === "Pending") {
    return "warning";
  }

  return "danger";
}
