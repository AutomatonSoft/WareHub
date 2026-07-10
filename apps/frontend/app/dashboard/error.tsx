"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../../components/ui/route-error-state";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route error", error);
  }, [error]);

  return <RouteErrorState titleKey="dashboardErrorTitle" descriptionKey="routeErrorDescription" reset={reset} />;
}

