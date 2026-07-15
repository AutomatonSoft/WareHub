"use client";

import { useEffect } from "react";

import { DashboardLiveOverview } from "../../components/dashboard/dashboard-live-overview";
import { AppShell } from "../../components/layout/app-shell";

export default function DashboardPage() {
  useEffect(() => {
    document.documentElement.classList.add("wh-dashboard-route");
    document.body.classList.add("wh-dashboard-route");

    return () => {
      document.documentElement.classList.remove("wh-dashboard-route");
      document.body.classList.remove("wh-dashboard-route");
    };
  }, []);

  return (
    <AppShell>
      <div className="wh-dashboard-page">
        <DashboardLiveOverview />
      </div>
    </AppShell>
  );
}

