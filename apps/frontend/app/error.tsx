"use client";

import { useEffect } from "react";
import { RouteErrorState } from "../components/ui/route-error-state";

type ErrorPageProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    console.error("App route error", error);
  }, [error]);

  return <RouteErrorState title="Page error" reset={reset} />;
}
