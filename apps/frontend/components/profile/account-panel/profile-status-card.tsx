"use client";

import { ErrorState } from "../../ui/error-state";

export function ProfileStatusCard({ title, message }: { title: string; message: string | null }) {
  if (!message) return null;
  return <ErrorState title={title} description={message} />;
}

