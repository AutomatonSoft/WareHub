"use client";

import { warehouseGrid } from "../../lib/mock-data";
import { useLabels } from "../../app/use-labels";
import { occupancyToneClass, occupancyValue } from "../../lib/warehouse-utils";
import { SectionHeader } from "../ui/section-header";
import { cn } from "../../lib/cn";

export function WarehouseMapGrid() {
  const t = useLabels();
  return (
    <section className="p-4">
      <SectionHeader title={t.warehouseDigitalTwin} />
      <div className="mt-4 grid gap-2 rounded-[var(--radius-control)] border border-border bg-muted/30 p-4">
        {warehouseGrid.map((row) => (
          <div key={row[0]} className="grid grid-cols-4 gap-2">
            {row.map((cell) => {
              const occupancy = occupancyValue(cell);
              return (
                <button
                  key={cell}
                  className={cn("focus-ring h-20 rounded-[var(--radius-control)] border text-left transition-colors hover:border-primary/45", occupancyToneClass(occupancy))}
                >
                  <div className="px-3 py-2">
                    <p className="text-xs font-medium uppercase tracking-normal opacity-75">{t.rack}</p>
                    <p className="page-title text-lg text-foreground">{cell}</p>
                    <p className="text-xs opacity-80">{occupancy}% {t.occupancy}</p>
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </section>
  );
}
