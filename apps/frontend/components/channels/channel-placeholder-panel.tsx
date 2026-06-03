"use client";

import { Construction } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { EmptyState } from "../ui/empty-state";

export function ChannelPlaceholderPanel({
  channelName,
  hint
}: {
  channelName: string;
  hint: string;
}) {
  const t = useLabels();
  return (
    <div className="mx-auto max-w-2xl rounded-xl border border-border bg-card p-6 shadow-sm">
      <div className="mb-3 flex justify-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-border bg-muted text-primary">
          <Construction size={20} />
        </div>
      </div>
      <EmptyState
        title={`${channelName} ${t.comingSoon}`}
        description={hint}
      />
      <p className="mt-3 text-center text-xs text-muted-foreground">Presentation-only placeholder. Integration logic remains unchanged.</p>
    </div>
  );
}
