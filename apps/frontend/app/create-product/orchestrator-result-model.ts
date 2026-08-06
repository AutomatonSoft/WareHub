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
    const body = (upstreamResponse as Record<string, unknown>)["body"];
    let bodyDetail = "";
    if (typeof body === "string") {
      try {
        const parsed = JSON.parse(body) as Record<string, unknown>;
        if (typeof parsed.detail === "string") {
          bodyDetail = `: ${parsed.detail}`;
        }
      } catch {
        // The upstream body is not JSON; the adapter-level error remains useful.
      }
    }
    if (typeof code === "string") {
      upstreamDetail = `, upstream=${code}${bodyDetail}`;
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
