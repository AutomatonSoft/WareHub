import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function TableShell({
  toolbar,
  footer,
  className,
  bodyClassName,
  children,
}: {
  toolbar?: ReactNode;
  footer?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <section className={cn("rounded-[var(--radius-card)] border border-border bg-card shadow-[var(--wh-shadow-card)]", className)}>
      {toolbar ? <div className="border-b border-border p-3">{toolbar}</div> : null}
      <div className={cn("min-w-0 overflow-x-auto", bodyClassName)}>{children}</div>
      {footer ? <div className="border-t border-border p-3">{footer}</div> : null}
    </section>
  );
}
