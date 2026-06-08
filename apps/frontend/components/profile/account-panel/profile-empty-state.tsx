"use client";

import { EmptyState } from "../../ui/empty-state";

export function ProfileEmptyState({ title, description }: { title: string; description: string }) {
  return <EmptyState title={title} description={description} />;
}

