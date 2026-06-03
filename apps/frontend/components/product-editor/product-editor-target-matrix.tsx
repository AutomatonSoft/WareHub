"use client";

import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { StatusBadge } from "../ui/status-badge";
import { EmptyState } from "../ui/empty-state";
import { cn } from "../../lib/cn";
import { getTargetStatusLabel } from "./product-editor-model";
import type { ProductEditorDiscoverResponse, ProductEditorGroupId, ProductEditorTarget } from "./product-editor-types";

type ProductEditorTargetMatrixProps = {
  discover: ProductEditorDiscoverResponse | null;
  activeGroupId: ProductEditorGroupId;
  onSelectGroup: (groupId: ProductEditorGroupId) => void;
  compact?: boolean;
  className?: string;
};

export function ProductEditorTargetMatrix({ discover, activeGroupId, onSelectGroup, compact = false, className }: ProductEditorTargetMatrixProps) {
  const targets = (discover?.groups ?? [])
    .flatMap((group) => group.targets.map((target) => ({ groupId: group.id, groupLabel: group.label, target })))
    .filter((row) => row.target.id !== "JV_MAIN");
  const foundCount = targets.filter((row) => row.target.status === "found").length;
  const plannedCount = targets.filter((row) => row.target.status === "planned").length;
  const missingCount = targets.filter((row) => row.target.status === "missing").length;

  return (
    <Card className={cn("rounded-2xl border-border bg-card shadow-sm", compact ? "h-auto" : "", className)}>
      <CardHeader className={cn("border-b border-border", compact ? "pb-2" : "pb-4")}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className={cn(compact ? "text-sm" : "text-base")}>Target Matrix</CardTitle>
            <CardDescription className={cn(compact ? "text-xs" : "")}>
              {discover ? `Marketplace availability for EAN ${discover.ean}` : "Run discover first"}
            </CardDescription>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <StatusBadge tone="found">Found {foundCount}</StatusBadge>
            <StatusBadge tone="planned">Planned {plannedCount}</StatusBadge>
            <StatusBadge tone="missing">Missing {missingCount}</StatusBadge>
          </div>
        </div>
      </CardHeader>
      <CardContent className={cn(compact ? "pt-2" : "pt-4")}>

      {!discover ? (
        compact ? (
          <div className="rounded-xl border border-dashed border-border bg-muted/20 px-3 py-4 text-xs text-muted-foreground">
            No product loaded yet.
          </div>
        ) : (
          <EmptyState
            title="No product loaded"
            description="Start with a 13-digit EAN in the command block, run Discover, then review JV/XL and marketplace targets."
            className="wh-target-matrix-empty py-8"
          />
        )
      ) : (
        compact ? (
          <div className="max-h-[236px] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 gap-1.5">
              {targets.map(({ groupId, groupLabel, target }) => (
                <Button
                  key={target.id}
                  type="button"
                  onClick={() => onSelectGroup(groupId)}
                  className={cn(
                    "h-auto min-h-[52px] justify-start rounded-lg border-border bg-muted/30 px-2 py-1.5 text-left shadow-none transition hover:bg-muted",
                    groupId === activeGroupId ? "border-primary/40 bg-primary/10 ring-1 ring-primary/50 ring-offset-1 ring-offset-background" : ""
                  )}
                  variant="outline"
                  title={`${groupLabel}: ${target.label} - ${getTargetStatusLabel(target.status)}`}
                >
                  <div className="w-full space-y-1">
                    <div className="truncate text-[9px] font-semibold uppercase tracking-[0.06em]">{target.label}</div>
                    <StatusBadge tone={target.status}>{getTargetStatusLabel(target.status)}</StatusBadge>
                  </div>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-8">
            {targets.map(({ groupId, groupLabel, target }) => (
              <Button
                key={target.id}
                type="button"
                onClick={() => onSelectGroup(groupId)}
                className={cn(
                  "h-auto justify-start rounded-xl border-border bg-muted/30 px-2.5 py-2 text-left shadow-none transition hover:bg-muted",
                  groupId === activeGroupId ? "border-primary/40 bg-primary/10 ring-1 ring-primary/50 ring-offset-1 ring-offset-background" : ""
                )}
                variant="outline"
                title={`${groupLabel}: ${target.label} - ${getTargetStatusLabel(target.status)}`}
              >
                <div className="w-full space-y-1">
                  <div className="truncate text-[10px] font-semibold uppercase tracking-[0.06em]">{target.label}</div>
                  <StatusBadge tone={target.status}>{getTargetStatusLabel(target.status)}</StatusBadge>
                </div>
              </Button>
            ))}
          </div>
        )
      )}
      </CardContent>
    </Card>
  );
}

