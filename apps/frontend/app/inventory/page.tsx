import { Suspense } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { InventoryTable } from "../../components/inventory/inventory-table";
import { LoadingState } from "../../components/ui/loading-state";

export default function InventoryPage() {
  return (
    <AppShell
      title="Inventory"
      subtitle="Kid and Orders data from database_service"
    >
      <Suspense fallback={<LoadingState title="Loading inventory table..." />}>
        <InventoryTable />
      </Suspense>
    </AppShell>
  );
}
