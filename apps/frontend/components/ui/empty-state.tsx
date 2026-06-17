import { Inbox } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function EmptyState({ title, description, className, children }: { title: string; description: string; className?: string; children?: ReactNode }) {
  return (
    <div className={cn("wh-empty-state flex min-h-36 flex-col items-center justify-center gap-2 rounded-[var(--radius-card)] border border-border bg-card p-5 text-center", className)}>
      <Inbox className="wh-empty-state__icon size-5 text-muted-foreground" />
      <p className="wh-empty-state__title text-sm font-medium text-foreground">{title}</p>
      <p className="wh-empty-state__description max-w-xl text-xs text-muted-foreground">{description}</p>
      {children}
    </div>
  );
}
