import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function FormField(props: {
  label: string;
  help?: string;
  error?: string | null;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={cn("grid gap-1.5", props.className)}>
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{props.label}</span>
      {props.children}
      {props.error ? <span className="text-xs text-destructive">{props.error}</span> : null}
      {!props.error && props.help ? <span className="text-xs text-muted-foreground">{props.help}</span> : null}
    </label>
  );
}

