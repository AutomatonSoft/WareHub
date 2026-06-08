"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../../components/ui/route-error-state";

export default function ChannelsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Channels route error", error);
  }, [error]);

  return <RouteErrorState title="Channels error" reset={reset} />;
}

