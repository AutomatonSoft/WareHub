import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SectionCard(props: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Card className={cn("wh-section-card border-border bg-card shadow-[var(--wh-shadow-card)]", props.className)}>
      {props.title || props.subtitle || props.actions ? (
        <CardHeader className="wh-section-card__header pb-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              {props.title ? <CardTitle className="wh-section-card__title text-base font-semibold text-foreground">{props.title}</CardTitle> : null}
              {props.subtitle ? <CardDescription className="wh-section-card__subtitle text-sm text-muted-foreground">{props.subtitle}</CardDescription> : null}
            </div>
            {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
          </div>
        </CardHeader>
      ) : null}
      <CardContent className={cn("pt-0", props.bodyClassName)}>{props.children}</CardContent>
    </Card>
  );
}
