"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../../components/ui/route-error-state";

export default function SofortListError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Sofort list route error", error);
  }, [error]);

  return <RouteErrorState titleKey="sofortListErrorTitle" descriptionKey="routeErrorDescription" reset={reset} />;
}

