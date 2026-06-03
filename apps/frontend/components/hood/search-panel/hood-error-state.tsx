"use client";

import { ErrorState } from "../../ui/error-state";

export function HoodErrorState({ title, description }: { title: string; description: string }) {
  return <ErrorState title={title} description={description} />;
}

