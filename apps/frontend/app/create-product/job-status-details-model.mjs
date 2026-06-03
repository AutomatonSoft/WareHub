function toObject(value) {
  if (!String(value || "").trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function toCount(payload) {
  if (!payload) return 0;
  const array = Array.isArray(payload.items)
    ? payload.items
    : Array.isArray(payload.events)
    ? payload.events
    : Array.isArray(payload.attempts)
    ? payload.attempts
    : null;
  return array ? array.length : 0;
}

export function buildJobStatusDetails(input) {
  const statusPayload = toObject(input?.jobStatusJson || "");
  const attemptsPayload = toObject(input?.jobAttemptsJson || "");
  const eventsPayload = toObject(input?.jobEventsJson || "");

  if (!statusPayload && !attemptsPayload && !eventsPayload) {
    return null;
  }

  const jobIdRaw = statusPayload?.job_id ?? statusPayload?.id ?? String(input?.latestJobId || "");
  const requestIdRaw = statusPayload?.request_id ?? statusPayload?.requestId ?? "";
  const statusRaw = statusPayload?.status ?? statusPayload?.state ?? "";

  return {
    jobId: typeof jobIdRaw === "string" ? jobIdRaw : String(input?.latestJobId || ""),
    requestId: typeof requestIdRaw === "string" ? requestIdRaw : "",
    status: typeof statusRaw === "string" ? statusRaw : "",
    attemptsCount: toCount(attemptsPayload),
    eventsCount: toCount(eventsPayload)
  };
}
