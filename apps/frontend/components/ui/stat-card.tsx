import type { ReactNode } from "react";

import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  description,
  icon,
  className,
  children,
}: {
  label: string;
  value: string | number;
  description?: string;
  icon?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={cn("h-full border-border bg-card shadow-[var(--wh-shadow-card)]", className)}>
      <CardHeader className="items-start gap-2 pb-0">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.02em] text-muted-foreground">{label}</p>
        </div>
        {icon ? (
          <CardAction>
            <div className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-primary/10 text-primary [&_svg]:size-4">
              {icon}
            </div>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col justify-between gap-3 pt-0">
        <div className="min-w-0 space-y-1.5">
          <p className="text-[2rem] font-semibold leading-none text-foreground">{value}</p>
          {description ? <p className="text-[11px] leading-4 text-muted-foreground">{description}</p> : null}
        </div>
        {children ? <div className="pt-1">{children}</div> : null}
      </CardContent>
    </Card>
  );
}
