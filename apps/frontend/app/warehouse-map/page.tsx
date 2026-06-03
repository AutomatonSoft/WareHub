import { AppShell } from "../../components/layout/app-shell";
import { WarehouseMapGrid } from "../../components/warehouse/warehouse-map-grid";
import { WarehouseZonePanel } from "../../components/warehouse/warehouse-zone-panel";
import { Card, CardContent } from "../../components/ui/card";

export default function WarehouseMapPage() {
  return (
    <AppShell
      title="Ware House Map"
      subtitle="Smart logistics control center with digital twin occupancy and active location overlays"
    >
      <div className="grid gap-4 xl:grid-cols-[1.5fr_0.8fr]">
        <Card className="shadow-sm">
          <CardContent className="pt-0">
            <WarehouseMapGrid />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="pt-0">
            <WarehouseZonePanel />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
