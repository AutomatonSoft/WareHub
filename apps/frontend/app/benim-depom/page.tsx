import { Suspense } from "react";

import { AppShell } from "../../components/layout/app-shell";
import { SofortListTable } from "../../components/inventory/sofort-list-table";
import { LoadingState } from "../../components/ui/loading-state";

export default function BenimDepomPage() {
  return (
    <AppShell titleKey="navBenimDepom" subtitleKey="benimDepomSubtitle">
      <Suspense fallback={<LoadingState titleKey="loadingSofortList" />}>
        <SofortListTable workspace="benim_depom" />
      </Suspense>
    </AppShell>
  );
}
