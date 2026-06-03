"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../../components/ui/route-error-state";

export default function ProductEditorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Product editor route error", error);
  }, [error]);

  return <RouteErrorState title="Product editor error" reset={reset} />;
}

