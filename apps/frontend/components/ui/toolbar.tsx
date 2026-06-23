import type { HTMLAttributes, ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Toolbar({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        "wh-toolbar flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-border bg-card p-3 shadow-[var(--wh-shadow-card)] sm:p-4 [&_button]:h-10 [&_input]:h-10",
        className
      )}
    >
      {children}
    </div>
  );
}

export function ToolbarGroup({ className, children, ...props }: HTMLAttributes<HTMLDivElement> & { children: ReactNode }) {
  return <div className={cn("flex min-w-0 flex-wrap items-center gap-2", className)} {...props}>{children}</div>;
}
