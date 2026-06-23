import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  description,
  actions,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0 flex flex-col gap-1">
        <h2 className="text-base font-semibold leading-tight text-foreground">{title}</h2>
        {description ? <p className="text-sm leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
