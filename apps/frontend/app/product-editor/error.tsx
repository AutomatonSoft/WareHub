"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../../components/ui/route-error-state";

export default function ProductEditorError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Product editor route error", error);
  }, [error]);

  const developmentMessage =
    process.env.NODE_ENV === "development" && error.message.trim()
      ? error.message
      : undefined;

  return (
    <RouteErrorState
      titleKey="productEditorErrorTitle"
      description={developmentMessage}
      descriptionKey={developmentMessage ? undefined : "routeErrorDescription"}
      reset={reset}
    />
  );
}
