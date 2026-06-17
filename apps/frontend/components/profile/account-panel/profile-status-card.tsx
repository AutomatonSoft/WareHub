"use client";

import { BadgeCheck, CircleAlert } from "lucide-react";
import { Card, CardContent } from "../../ui/card";

export function ProfileStatusCard({ title, message }: { title: string; message: string | null }) {
  if (!message) return null;
  const isLikelyError = /failed|error|invalid|required|mismatch|unable|not authenticated|not found|unauthorized/i.test(message);

  return (
    <Card className="border-border/70">
      <CardContent className="pt-3">
        <div className="flex items-start gap-3 rounded-[var(--radius-control)] border border-border/70 bg-muted/20 p-3">
          <div
            className={
              isLikelyError
                ? "flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-destructive/10 text-destructive"
                : "flex size-9 shrink-0 items-center justify-center rounded-[var(--radius-control)] bg-primary/10 text-primary"
            }
          >
            {isLikelyError ? <CircleAlert data-icon="inline-start" /> : <BadgeCheck data-icon="inline-start" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{message}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

