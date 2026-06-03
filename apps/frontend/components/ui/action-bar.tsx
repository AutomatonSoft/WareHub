import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("sticky bottom-0 z-20 flex flex-wrap items-center justify-end gap-2 rounded-xl border bg-card/95 p-3 backdrop-blur", className)}>
      {children}
    </div>
  );
}

