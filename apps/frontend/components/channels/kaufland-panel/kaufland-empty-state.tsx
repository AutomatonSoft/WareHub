"use client";

import { EmptyState } from "../../ui/empty-state";

export function KauflandEmptyState({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}

