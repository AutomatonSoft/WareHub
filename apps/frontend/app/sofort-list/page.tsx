import { Suspense } from "react";
import { AppShell } from "../../components/layout/app-shell";
import { SofortListTable } from "../../components/inventory/sofort-list-table";
import { LoadingState } from "../../components/ui/loading-state";

export default function SofortListPage() {
  return (
    <AppShell titleKey="navSofortList" subtitleKey="sofortListSubtitle">
      <Suspense fallback={<LoadingState titleKey="loadingSofortList" />}>
        <SofortListTable />
      </Suspense>
    </AppShell>
  );
}
