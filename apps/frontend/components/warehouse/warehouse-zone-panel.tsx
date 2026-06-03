"use client";

import { zoneSummary } from "../../lib/mock-data";
import { useLabels } from "../../app/use-labels";
import { Badge } from "../shared/badge";
import { Card } from "../shared/card";

export function WarehouseZonePanel() {
  const t = useLabels();
  return (
    <Card className="rounded-xl border-border bg-card shadow-sm">
      <h3 className="page-title text-lg">{t.zoneDetails}</h3>
      <div className="mt-4 space-y-3">
        {zoneSummary.map((zone) => (
          <div key={zone.zone} className="rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[color:var(--text-primary)]">{zone.zone}</p>
              <Badge tone={zone.occupancy > 80 ? "warning" : "success"}>{zone.occupancy}%</Badge>
            </div>
            <p className="mt-1 text-xs text-[color:var(--text-muted)]">{t.activePicks}: {zone.activePicks}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
