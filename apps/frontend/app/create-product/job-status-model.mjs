export function normalizeJobId(value) {
  return String(value || "").trim();
}

export function parseJobEventsSummary(jobEventsJson) {
  if (!jobEventsJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(jobEventsJson);
    const events = Array.isArray(parsed?.events)
      ? parsed.events
      : Array.isArray(parsed?.items)
      ? parsed.items
      : [];

    const failedOrErrorEvents = events.filter((event) => {
      if (typeof event !== "object" || event === null) {
        return false;
      }
      const raw = String(event.event ?? event.type ?? "").toLowerCase();
      return raw.includes("fail") || raw.includes("error");
    }).length;

    return {
      totalEvents: events.length,
      failedOrErrorEvents
    };
  } catch {
    return null;
  }
}
