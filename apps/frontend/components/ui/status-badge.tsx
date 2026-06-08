import type { ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusTone = "found" | "missing" | "planned" | "error" | "read_only" | "unsupported" | "unknown";

const toneClass: Record<StatusTone, string> = {
  found: "border-emerald-300 bg-emerald-50 text-emerald-800",
  missing: "border-slate-300 bg-slate-100 text-slate-700",
  planned: "border-amber-300 bg-amber-50 text-amber-800",
  error: "border-rose-300 bg-rose-50 text-rose-800",
  read_only: "border-sky-300 bg-sky-50 text-sky-800",
  unsupported: "border-zinc-300 bg-zinc-100 text-zinc-700",
  unknown: "border-border bg-muted text-muted-foreground"
};

export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: ReactNode; className?: string }) {
  return (
    <Badge variant="outline" className={cn("capitalize", toneClass[tone], className)}>
      {children}
    </Badge>
  );
}
