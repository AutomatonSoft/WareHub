import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function PageShell({ className, children }: { className?: string; children: ReactNode }) {
<<<<<<< HEAD
  return <div className={cn("wh-page-shell flex w-full flex-col gap-3", className)}>{children}</div>;
=======
  return <div className={cn("w-full space-y-3", className)}>{children}</div>;
>>>>>>> origin/main
}
