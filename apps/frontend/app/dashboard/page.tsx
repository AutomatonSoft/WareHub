"use client";

import { ActivityTimeline } from "../../components/dashboard/activity-timeline";
import { DashboardLiveOverview } from "../../components/dashboard/dashboard-live-overview";
import { SyncStatusCard } from "../../components/dashboard/sync-status-card";
import { AppShell } from "../../components/layout/app-shell";
import { useLabels } from "../use-labels";

export default function DashboardPage() {
  const t = useLabels();
  return (
    <AppShell
      title={t.dashboard}
      subtitle={t.dashboardEnterpriseSubtitle}
    >
      <div className="wh-dashboard ui-enter-stagger">
        <DashboardLiveOverview />
        <div className="wh-dashboard__bottom-grid stagger-children">
          <SyncStatusCard />
          <ActivityTimeline />
        </div>
      </div>
    </AppShell>
  );
}

