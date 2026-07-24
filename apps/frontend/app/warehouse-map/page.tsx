import { AppShell } from "../../components/layout/app-shell";
import { Surface } from "../../components/ui/surface";
import { WarehouseMapCanvas } from "../../components/warehouse/warehouse-map-canvas";

export default function WarehouseMapPage() {
  return (
    <AppShell titleKey="navWarehouseMap" subtitleKey="warehouseMapSubtitle">
      <section className="flex h-[calc(100dvh-24px)] min-h-[620px] w-full flex-col">
        <Surface className="flex min-h-0 flex-1 flex-col p-4 sm:p-6">
          <WarehouseMapCanvas />
        </Surface>
      </section>
    </AppShell>
  );
}
