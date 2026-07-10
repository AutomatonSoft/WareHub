"use client";

import { useLabels } from "../../../app/use-labels";
import { ErrorState } from "../../ui/error-state";

export function XLJVErrorState({ message }: { message: string }) {
  const t = useLabels();
  return <ErrorState title={t.xljvRequestFailed} description={message} />;
}
