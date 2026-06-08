import { TriangleAlert } from "lucide-react";

import { cn } from "@/lib/utils";

export function ErrorState({ title, description, className }: { title: string; description: string; className?: string }) {
  return (
    <div className={cn("wh-error-state wh-error-state__container flex w-full items-start gap-3 rounded-2xl border border-[#FECACA] bg-[#FEF2F2] px-4 py-4", className)}>
      <TriangleAlert className="wh-error-state__icon size-4 text-destructive" />
      <div className="space-y-3">
        <p className="wh-error-state__title text-sm font-semibold text-[#DC2626]">{title}</p>
        <p className="wh-error-state__description text-sm text-[#DC2626]">{description}</p>
      </div>
    </div>
  );
}

