"use client";

import { ErrorState } from "../../ui/error-state";

export function XLJVErrorState({ message }: { message: string }) {
  return <ErrorState title="Request failed" description={message} />;
}
