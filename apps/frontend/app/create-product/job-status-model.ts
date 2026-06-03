export type JobEventsSummary = {
  totalEvents: number;
  failedOrErrorEvents: number;
};

export function normalizeJobId(value: string): string {
  return value.trim();
}

export function parseJobEventsSummary(jobEventsJson: string): JobEventsSummary | null {
  if (!jobEventsJson) {
    return null;
  }

  try {
    const parsed = JSON.parse(jobEventsJson) as Record<string, unknown>;
    const events = Array.isArray(parsed.events)
      ? parsed.events
      : Array.isArray(parsed.items)
      ? parsed.items
      : [];

    const failedOrErrorEvents = events.filter((event) => {
      if (typeof event !== "object" || event === null) {
        return false;
      }
      const record = event as Record<string, unknown>;
      const raw = String(record.event ?? record.type ?? "").toLowerCase();
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
