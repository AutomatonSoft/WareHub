import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

export function EmptyState({ title, description, className }: { title: string; description: string; className?: string }) {
  return (
    <div className={cn("wh-empty-state flex min-h-[220px] flex-col items-center justify-center gap-2 rounded-2xl border border-[#E2E8F0] bg-white p-6 text-center", className)}>
      <Inbox className="wh-empty-state__icon size-5 text-muted-foreground" />
      <p className="wh-empty-state__title text-sm font-medium text-[#0F172A]">{title}</p>
      <p className="wh-empty-state__description max-w-xl text-xs text-[#64748B]">{description}</p>
    </div>
  );
}
