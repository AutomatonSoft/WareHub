"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../../components/ui/route-error-state";

export default function ProfileError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Profile route error", error);
  }, [error]);

  return <RouteErrorState titleKey="profileErrorTitle" descriptionKey="routeErrorDescription" reset={reset} />;
}
