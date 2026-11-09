"use client";

import { Check, CircleAlert, Clock3, LoaderCircle } from "lucide-react";
import { useLanguage } from "../../app/use-labels";
import { describeMarketplaceError } from "../product-forms/marketplace-errors.mjs";
import { buildTaskTargetRows, targetStateLabel, type TaskTarget, type TargetState } from "./task-target-model";

const stateClasses: Record<TargetState, string> = {
  queued: "bg-muted text-muted-foreground", running: "bg-amber-50 text-amber-700",
  processing: "bg-amber-50 text-amber-700",
  submitted: "bg-amber-50 text-amber-700", success: "bg-emerald-50 text-emerald-700",
  failed: "bg-destructive/10 text-destructive", unknown: "bg-muted text-muted-foreground", skipped: "bg-muted text-muted-foreground",
};

export function TaskTargetList({ results, targets, status, operation }: {
  results?: TaskTarget[]; targets?: string[]; status: string; operation: string;
}) {
  const language = useLanguage();
  const rows = buildTaskTargetRows(results, targets, status);
  if (!rows.length) return null;
  return <ul className="mt-3 divide-y rounded-lg border bg-background text-sm">
    {rows.map(row => {
      const loading = row.state === "running" || row.state === "processing";
      const Icon = loading ? LoaderCircle : row.state === "failed" ? CircleAlert : row.state === "success" ? Check : Clock3;
      return <li key={row.key} className="flex flex-col gap-1 px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-foreground">{row.label}</span>
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs ${stateClasses[row.state]}`}>
            <Icon size={13} aria-hidden="true" className={loading ? "animate-spin motion-reduce:animate-none" : undefined} />
            {targetStateLabel(row.state, language, operation)}
          </span>
        </div>
        {row.ean ? <p className="break-all text-xs text-muted-foreground">EAN: {row.ean}</p> : null}
        {row.state === "failed" ? <p className="break-words text-xs text-destructive">{describeMarketplaceError(row.target, language).message}</p> : null}
      </li>;
    })}
  </ul>;
}
