import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageShell({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("wh-page-shell flex w-full flex-col gap-3", className)}>{children}</div>;
}
