import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageShell({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("w-full space-y-3", className)}>{children}</div>;
}
