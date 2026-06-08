import React from "react";
import { cn } from "../../lib/cn";

type BadgeTone = "success" | "warning" | "danger" | "neutral";

const toneMap: Record<BadgeTone, string> = {
  success: "ui-status-success",
  warning: "ui-status-warning",
  danger: "ui-status-danger",
  neutral: "ui-status-info"
};

export function Badge({
  tone = "neutral",
  children,
  className
}: {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "ui-status-chip",
        toneMap[tone],
        className
      )}
    >
      <span className="ui-status-dot" />
      {children}
    </span>
  );
}
