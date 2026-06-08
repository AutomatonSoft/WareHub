import { cn } from "../../lib/cn";
import type { CSSProperties } from "react";

export function Skeleton({ className, delayMs = 0 }: { className?: string; delayMs?: number }) {
  const style = { "--sk-delay": `${delayMs}ms` } as CSSProperties;
  return <div className={cn("skeleton-base", className)} style={style} aria-hidden="true" />;
}
