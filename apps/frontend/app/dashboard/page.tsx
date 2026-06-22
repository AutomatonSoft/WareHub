"use client";

import { DashboardLiveOverview } from "../../components/dashboard/dashboard-live-overview";
import { AppShell } from "../../components/layout/app-shell";
import { useLabels } from "../use-labels";

export default function DashboardPage() {
  const t = useLabels();
  return (
    <AppShell
      title={t.dashboard}
      subtitle={t.dashboardEnterpriseSubtitle}
    >
      <DashboardLiveOverview />
    </AppShell>
  );
}

