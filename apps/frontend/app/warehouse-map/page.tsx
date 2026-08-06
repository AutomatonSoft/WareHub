import { AppShell } from "../../components/layout/app-shell";
import { WarehouseMapExplorer } from "../../components/warehouse/warehouse-map-explorer";

export default function WarehouseMapPage() {
  return (
    <AppShell titleKey="navWarehouseMap" subtitleKey="warehouseMapSubtitle">
      <section className="flex w-full p-0">
        <WarehouseMapExplorer />
      </section>
    </AppShell>
  );
}
