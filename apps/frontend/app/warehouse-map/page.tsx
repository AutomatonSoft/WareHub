import { AppShell } from "../../components/layout/app-shell";
import { WarehouseMapGrid } from "../../components/warehouse/warehouse-map-grid";
import { WarehouseZonePanel } from "../../components/warehouse/warehouse-zone-panel";
import { Surface } from "../../components/ui/surface";

export default function WarehouseMapPage() {
  return (
    <AppShell
      titleKey="navWarehouseMap"
      subtitleKey="warehouseMapSubtitle"
    >
      <div className="grid gap-4 xl:grid-cols-[1.5fr_0.8fr]">
        <Surface className="p-0">
          <WarehouseMapGrid />
        </Surface>
        <Surface className="p-0">
          <WarehouseZonePanel />
        </Surface>
      </div>
    </AppShell>
  );
}
