import type { OrchestratorResult } from "./orchestrator-api";

export function extractFailureReason(result: OrchestratorResult): string {
  const error = result.error;
  if (!error) {
    return `${result.marketplace}: unknown error`;
  }

  const details = error.details ?? {};
  const upstreamResponse = details["upstream_response"];
  let upstreamDetail = "";
  if (upstreamResponse && typeof upstreamResponse === "object") {
    const code = (upstreamResponse as Record<string, unknown>)["code"];
    const detail = (upstreamResponse as Record<string, unknown>)["detail"];
    if (typeof code === "string") {
      upstreamDetail = `, upstream=${code}`;
    } else if (typeof detail === "string") {
      upstreamDetail = `, upstream=${detail}`;
    }
  }

  return `${result.marketplace}: ${result.status_code}/${error.code}${upstreamDetail}`;
}

export function buildFailureSummary(results: OrchestratorResult[]): string {
  const failed = results.filter((item) => item.status === "failed");
  if (failed.length === 0) {
    return "";
  }
  return failed.map(extractFailureReason).join("; ");
}
