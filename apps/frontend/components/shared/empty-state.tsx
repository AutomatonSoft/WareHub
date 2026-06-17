"use client";

import { useLabels } from "../../app/use-labels";
import { Button } from "@/components/ui/button";
import { EmptyState as UIEmptyState } from "@/components/ui/empty-state";

type EmptyStateVariant = "default" | "inventory" | "sofort" | "marketplace";

type EmptyStateProps = {
  message?: string;
  compact?: boolean;
  title?: string;
  actionLabel?: string;
  onAction?: () => void;
  variant?: EmptyStateVariant;
};

export function EmptyState({ message, compact = false, title, actionLabel, onAction, variant = "default" }: EmptyStateProps) {
  const t = useLabels();
  const variantClassName =
    variant === "marketplace"
      ? "border-warning/30 bg-warning/5"
      : variant === "inventory" || variant === "sofort"
        ? "border-primary/25 bg-primary/5"
        : "";

  return (
    <UIEmptyState
      title={title || t.noDataFound}
      description={message || t.noDataFound}
      className={`ui-state-shell ${compact ? "min-h-28 p-4" : "p-5"} ${variantClassName}`}
    >
      {actionLabel && onAction ? (
        <Button type="button" variant="secondary" size="sm" onClick={onAction} className="mt-1">
          {actionLabel}
        </Button>
      ) : null}
    </UIEmptyState>
  );
}
