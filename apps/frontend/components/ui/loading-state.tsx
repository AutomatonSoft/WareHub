 "use client";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { type labels } from "@/app/i18n";
import { useLabels } from "@/app/use-labels";

type LabelKey = keyof (typeof labels)["en"];

export function LoadingState({
  title,
  titleKey,
  className
}: {
  title?: string;
  titleKey?: LabelKey;
  className?: string;
}) {
  const t = useLabels();
  const resolvedTitle = titleKey ? t[titleKey] : (title ?? t.loading);

  return (
    <div className={cn("space-y-4 rounded-[var(--radius-card)] border border-border bg-card p-4", className)}>
      <div className="space-y-2">
        <Skeleton className="h-4 w-40" />
        <p className="text-xs text-muted-foreground">{resolvedTitle}</p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <Skeleton className="h-20 rounded-[var(--radius-control)]" />
        <Skeleton className="h-20 rounded-[var(--radius-control)]" />
        <Skeleton className="h-20 rounded-[var(--radius-control)]" />
      </div>
      <Skeleton className="h-64 w-full rounded-[var(--radius-control)]" />
    </div>
  );
}


