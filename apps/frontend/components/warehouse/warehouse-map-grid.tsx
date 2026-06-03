"use client";

import { warehouseGrid } from "../../lib/mock-data";
import { useLabels } from "../../app/use-labels";
import { occupancyGradient, occupancyValue } from "../../lib/warehouse-utils";
import { Card } from "../shared/card";

export function WarehouseMapGrid() {
  const t = useLabels();
  return (
    <Card className="rounded-xl border-border bg-card shadow-sm">
      <h3 className="page-title text-lg">{t.warehouseDigitalTwin}</h3>
      <div className="mt-4 grid gap-2 rounded-xl border border-border bg-muted/30 p-4">
        {warehouseGrid.map((row) => (
          <div key={row[0]} className="grid grid-cols-4 gap-2">
            {row.map((cell) => {
              const occupancy = occupancyValue(cell);
              return (
                <button
                  key={cell}
                  className={`focus-ring h-20 rounded-xl border border-border bg-gradient-to-br ${occupancyGradient(occupancy)} text-left shadow-sm`}
                >
                  <div className="px-3 py-2">
                    <p className="text-xs uppercase tracking-[0.08em] text-emerald-900/70">{t.rack}</p>
                    <p className="page-title text-lg text-emerald-950">{cell}</p>
                    <p className="text-xs text-emerald-900/70">{occupancy}% {t.occupancy}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </Card>
  );
}
