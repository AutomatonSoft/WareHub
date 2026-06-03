import React from "react";
import { cn } from "../../lib/cn";
import { Card as UICard } from "../ui/card";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return <UICard className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)}>{children}</UICard>;
}

