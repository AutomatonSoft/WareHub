"use client";

import { Boxes, Inbox, Sparkles, Store } from "lucide-react";
import { useLabels } from "../../app/use-labels";
import { Card } from "./card";

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
  const iconClassName = compact ? "text-[color:var(--text-muted)]" : "text-[color:var(--primary)]";
  const iconSize = compact ? 16 : 18;
  const iconShellClassName =
    variant === "inventory"
      ? "bg-emerald-50"
      : variant === "sofort"
        ? "bg-emerald-50"
        : variant === "marketplace"
          ? "bg-amber-50"
          : "bg-muted";

  const icon = (() => {
    if (variant === "inventory") return <Boxes size={iconSize} className={iconClassName} />;
    if (variant === "marketplace") return <Store size={iconSize} className={iconClassName} />;
    if (variant === "sofort") return <Inbox size={iconSize} className={iconClassName} />;
    return compact ? <Inbox size={iconSize} className={iconClassName} /> : <Sparkles size={iconSize} className={iconClassName} />;
  })();

  return (
    <Card className={`ui-state-shell ${compact ? "p-4" : "p-6"} rounded-xl border-border bg-card shadow-sm`}>
      <div className="flex flex-col items-center justify-center gap-2 text-center">
        <span className={`inline-flex h-10 w-10 items-center justify-center rounded-full border border-border ${iconShellClassName}`}>
          {icon}
        </span>
        <p className="ui-state-title">{title || t.noDataFound}</p>
        <p className="ui-state-text text-[color:var(--text-muted)]">{message || t.noDataFound}</p>
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction} className="ui-button ui-button-secondary mt-1 h-10 px-4 text-sm">
            {actionLabel}
          </button>
        ) : null}
      </div>
    </Card>
  );
}
