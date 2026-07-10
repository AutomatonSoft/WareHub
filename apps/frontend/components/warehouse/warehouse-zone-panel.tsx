"use client";

import { zoneSummary } from "../../lib/mock-data";
import { useLabels } from "../../app/use-labels";
import { Badge } from "../shared/badge";
import { SectionHeader } from "../ui/section-header";

export function WarehouseZonePanel() {
  const t = useLabels();
  const zoneLabels: Record<string, string> = {
    receiving: t.warehouseZoneReceiving,
    fast_moving: t.warehouseZoneFastMoving,
    bulk_storage: t.warehouseZoneBulkStorage,
    returns: t.warehouseZoneReturns
  };
  return (
    <section className="p-4">
      <SectionHeader title={t.zoneDetails} />
      <div className="mt-4 space-y-3">
        {zoneSummary.map((zone) => (
          <div key={zone.zone} className="rounded-[var(--radius-control)] border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">{zoneLabels[zone.zone] ?? zone.zone}</p>
              <Badge tone={zone.occupancy > 80 ? "warning" : "success"}>{zone.occupancy}%</Badge>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{t.activePicks}: {zone.activePicks}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
