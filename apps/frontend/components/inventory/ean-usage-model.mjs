function toText(value, fallback = "-") {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return fallback;
}

function toRecord(value) {
  return typeof value === "object" && value !== null ? value : null;
}

export function buildEanUsageTimelineRows(usages) {
  return (Array.isArray(usages) ? usages : [])
    .map((item, index) => {
      const row = toRecord(item);
      if (!row) {
        return null;
      }
      const event = toText(row.event ?? row.action ?? row.usage_event);
      const status = toText(row.status ?? row.state);
      const marketplace = toText(row.marketplace ?? row.channel ?? row.service);
      const account = toText(row.account ?? row.owner ?? row.created_by);
      const kidId = toText(row.kid_id ?? row.kid ?? row.kid_number);
      const site = toText(row.site);
      const siteKey = toText(row.site_key);
      const localProductId = toText(row.local_product_id);
      const sourceProductId = toText(row.source_product_id);
      const eventAtRaw = toText(
        row.published_at ?? row.used_at ?? row.reserved_at ?? row.created_at ?? row.updated_at,
        "-"
      );
      const eventDate = eventAtRaw === "-" ? null : new Date(eventAtRaw);
      const sortTimestamp = eventDate && !Number.isNaN(eventDate.getTime()) ? eventDate.getTime() : 0;
      const id = `${event}-${site}-${siteKey}-${localProductId}-${sourceProductId}-${index}`;
      return {
        id,
        event,
        status,
        marketplace,
        account,
        kidId,
        site,
        siteKey,
        localProductId,
        sourceProductId,
        eventAt: eventAtRaw,
        sortTimestamp
      };
    })
    .filter((item) => item !== null)
    .sort((a, b) => b.sortTimestamp - a.sortTimestamp);
}
