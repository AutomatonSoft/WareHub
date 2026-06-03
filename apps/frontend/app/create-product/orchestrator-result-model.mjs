export function extractFailureReason(result) {
  const error = result?.error;
  if (!error) {
    return `${result?.marketplace}: unknown error`;
  }

  const details = error.details ?? {};
  const upstreamResponse = details.upstream_response;
  let upstreamDetail = "";
  if (upstreamResponse && typeof upstreamResponse === "object") {
    const code = upstreamResponse.code;
    const detail = upstreamResponse.detail;
    if (typeof code === "string") {
      upstreamDetail = `, upstream=${code}`;
    } else if (typeof detail === "string") {
      upstreamDetail = `, upstream=${detail}`;
    }
  }

  return `${result.marketplace}: ${result.status_code}/${error.code}${upstreamDetail}`;
}

export function buildFailureSummary(results) {
  const failed = (Array.isArray(results) ? results : []).filter((item) => item?.status === "failed");
  if (failed.length === 0) {
    return "";
  }
  return failed.map(extractFailureReason).join("; ");
}
