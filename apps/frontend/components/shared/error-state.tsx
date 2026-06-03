"use client";

import { AlertTriangle } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { Button } from "./button";
import { Card } from "./card";

type ErrorStateProps = {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
};

export function ErrorState({ message, onRetry, compact = false }: ErrorStateProps) {
  const t = useLabels();
  const details = message?.trim() || t.unexpectedError;

  return (
    <Card className={`ui-state-shell ${compact ? "p-3" : "p-5"}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 text-[color:var(--warning)]" />
        <div className="min-w-0 space-y-2">
          <p className="ui-state-title">{t.somethingWentWrong}</p>
          <p className="ui-state-text ui-state-error-text break-words">{details}</p>
          {onRetry ? (
            <Button type="button" variant="secondary" className="h-10 px-4 text-sm" onClick={onRetry}>
              {t.tryAgain}
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
