"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../../components/ui/route-error-state";

export default function MarketplaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Marketplace route error", error);
  }, [error]);

  return <RouteErrorState title="Marketplace error" reset={reset} />;
}

