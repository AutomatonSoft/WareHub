import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type SurfaceVariant = "default" | "muted" | "plain";

const surfaceVariants: Record<SurfaceVariant, string> = {
  default: "border border-border bg-card shadow-[var(--wh-shadow-card)]",
<<<<<<< HEAD
  muted: "border border-border bg-muted/20 shadow-none",
=======
  muted: "border border-border bg-muted/30 shadow-none",
>>>>>>> origin/main
  plain: "border border-transparent bg-transparent shadow-none",
};

export function Surface({
  as: Component = "section",
  variant = "default",
  className,
  children,
}: {
  as?: "section" | "div" | "article" | "aside";
  variant?: SurfaceVariant;
  className?: string;
  children: ReactNode;
}) {
  return (
<<<<<<< HEAD
    <Component className={cn("rounded-[var(--radius-card)] p-5 text-card-foreground sm:p-6", surfaceVariants[variant], className)}>
=======
    <Component className={cn("rounded-[var(--radius-card)] p-4 text-card-foreground", surfaceVariants[variant], className)}>
>>>>>>> origin/main
      {children}
    </Component>
  );
}
