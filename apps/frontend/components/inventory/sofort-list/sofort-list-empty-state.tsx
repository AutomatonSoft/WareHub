import { Inbox } from "lucide-react";

import { Button } from "@/components/ui/button";

export function SofortListEmptyState({ clearLabel, onReset }: { clearLabel: string; onReset: () => void }) {
  return (
    <div className="wh-empty-state flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-xl bg-muted/10 p-4 text-center">
      <Inbox className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">No sofort rows found</p>
      <p className="text-xs text-muted-foreground">No rows match your current filters.</p>
      <Button type="button" variant="outline" onClick={onReset}>
        {clearLabel}
      </Button>
    </div>
  );
}

