"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../../components/ui/route-error-state";

export default function InventoryError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Inventory route error", error);
  }, [error]);

  return <RouteErrorState title="Inventory error" reset={reset} />;
}

