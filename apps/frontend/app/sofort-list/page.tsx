import { Suspense } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { SofortListTable } from "../../components/inventory/sofort-list-table";
import { LoadingState } from "../../components/ui/loading-state";

export default function SofortListPage() {
  return (
    <AppShell title="Sofort list" subtitle="Products list with photo and KID number">
      <Suspense fallback={<LoadingState title="Loading sofort list..." />}>
        <SofortListTable />
      </Suspense>
    </AppShell>
  );
}
